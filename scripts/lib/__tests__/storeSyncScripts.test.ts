/**
 * scripts/pipeline/sync-stores.sh and publish-stores.sh (#1722, plan S1-2).
 *
 * These run the REAL scripts against a stand-in `gcloud`
 * (fixtures/gcloud-shim/gcloud) whose bucket is a temp directory (D10). The
 * YAML guards could only check the plan (which commands appear, in what set);
 * these check what the scripts actually leave on disk and in the "bucket".
 *
 * The incident shapes they pin:
 *  - `rsync ... || true` turned a transport/auth error into "first run": the
 *    store loaded empty and the push wrote a one-point file over the
 *    accumulated one (#1111 class).
 *  - gcloud 568 downloaded `Content-Encoding: gzip` objects without inflating
 *    them and the `-Z` upload added a layer each run (#1702). gcloud 588 (the
 *    D1 pin) inflates one layer. The scripts must be right under both.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { createHash } from 'node:crypto'

const REPO = process.cwd()
const SYNC = path.join(REPO, 'scripts/pipeline/sync-stores.sh')
const PUBLISH = path.join(REPO, 'scripts/pipeline/publish-stores.sh')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const BUCKET = 'test-bucket'
const DIR_STORES = ['time-series', 'club-trends', 'club-race'] as const

let tmp: string
let root: string
let cache: string
let log: string
let summary: string

function gzipTimes(data: Buffer, layers: number): Buffer {
  let out = data
  for (let i = 0; i < layers; i++) out = zlib.gzipSync(out)
  return out
}

/**
 * Put an object in the fake bucket. `layers` >= 1 marks it
 * Content-Encoding: gzip, the way a `cp -Z` upload stores it; the extra
 * layers are the #1702 stacking.
 */
function putObject(objectPath: string, content: Buffer, layers = 0): void {
  const obj = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, gzipTimes(content, layers))
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(meta, layers > 0 ? 'content-encoding=gzip\n' : '')
}

function readObject(objectPath: string): Buffer {
  return fs.readFileSync(path.join(root, BUCKET, objectPath))
}

function readMeta(objectPath: string): string {
  return fs.readFileSync(path.join(root, '.meta', BUCKET, objectPath), 'utf-8')
}

function run(
  script: string,
  args: string[],
  env: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bash', [script, BUCKET, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${SHIM_DIR}:${process.env.PATH}`,
      GCLOUD: path.join(SHIM_DIR, 'gcloud'),
      SHIM_ROOT: root,
      SHIM_LOG: log,
      CACHE_DIR: cache,
      GITHUB_STEP_SUMMARY: summary,
      ...env,
    },
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

function calls(): string[] {
  return fs.existsSync(log)
    ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean)
    : []
}

function localFiles(store: string): string[] {
  const dir = path.join(cache, store)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort()
}

const doc = (n: number): Buffer =>
  Buffer.from(JSON.stringify({ districtId: String(n), points: [n, n + 1] }))

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-sync-'))
  root = path.join(tmp, 'gcs')
  cache = path.join(tmp, 'cache')
  log = path.join(tmp, 'gcloud.log')
  summary = path.join(tmp, 'summary.md')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('sync-stores.sh (#1722)', () => {
  it('treats an empty remote as a first run: empty store, exit 0', () => {
    const r = run(SYNC, [...DIR_STORES, 'district-awards-history'])
    expect(r.status, r.stderr).toBe(0)
    for (const store of DIR_STORES) {
      expect(fs.existsSync(path.join(cache, store))).toBe(true)
      expect(localFiles(store)).toEqual([])
    }
    expect(
      fs.existsSync(path.join(cache, 'district-awards-history.json'))
    ).toBe(false)
  })

  it('fails on a transport error during the download (was green behind `|| true`)', () => {
    putObject('time-series/2026-2027/district_61.json', doc(61))
    const r = run(SYNC, ['time-series'], { SHIM_FAIL_MATCH: '^rsync ' })
    expect(r.status).not.toBe(0)
  })

  it('fails on a transport error while listing the remote', () => {
    putObject('club-race/2026-2027/first-reached.json', doc(1))
    const r = run(SYNC, ['club-race'], { SHIM_FAIL_MATCH: '^ls ' })
    expect(r.status).not.toBe(0)
  })

  it('fails on a missing bucket rather than treating it as a first run', () => {
    fs.rmSync(path.join(root, BUCKET), { recursive: true })
    const r = run(SYNC, ['club-trends'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not found: 404')
  })

  it('fails when fewer files land than the remote listing holds', () => {
    putObject('club-trends/2026-2027/district_61.json', doc(61))
    putObject('club-trends/2026-2027/district_62.json', doc(62))
    const r = run(SYNC, ['club-trends'], {
      SHIM_DOWNLOAD_SKIP: 'district_62',
    })
    expect(r.status).not.toBe(0)
  })

  it('fails on a store file that is not JSON', () => {
    putObject('club-race/2026-2027/first-reached.json', Buffer.from('{trunc'))
    const r = run(SYNC, ['club-race'])
    expect(r.status).not.toBe(0)
  })

  it('lists the remote before downloading each store', () => {
    for (const store of DIR_STORES) putObject(`${store}/a/x.json`, doc(1))
    const r = run(SYNC, [...DIR_STORES])
    expect(r.status, r.stderr).toBe(0)
    const c = calls()
    for (const store of DIR_STORES) {
      const ls = c.findIndex(l =>
        l.startsWith(`storage ls gs://${BUCKET}/${store}/`)
      )
      const rsync = c.findIndex(l =>
        l.startsWith(`storage rsync -r gs://${BUCKET}/${store}/`)
      )
      expect(ls, c.join('\n')).toBeGreaterThanOrEqual(0)
      expect(rsync, c.join('\n')).toBeGreaterThan(ls)
    }
  })

  for (const decompress of ['0', '1']) {
    const sdk = decompress === '1' ? 'gcloud 588' : 'gcloud 568'
    for (const layers of [1, 10]) {
      it(`leaves plain JSON on disk from a ${layers}-layer object (${sdk})`, () => {
        putObject('time-series/2026-2027/district_61.json', doc(61), layers)
        putObject('time-series/2025-2026/district_61.json', doc(60), layers)
        const r = run(SYNC, ['time-series'], {
          SHIM_DOWNLOAD_DECOMPRESS: decompress,
        })
        expect(r.status, r.stderr).toBe(0)
        expect(localFiles('time-series')).toEqual([
          '2025-2026/district_61.json',
          '2026-2027/district_61.json',
        ])
        const body = fs.readFileSync(
          path.join(cache, 'time-series/2026-2027/district_61.json')
        )
        expect(body.equals(doc(61))).toBe(true)
      })
    }
  }

  it('pulls district-awards-history fail-closed and normalises it', () => {
    putObject('district-awards-history.json', doc(7), 3)
    const r = run(SYNC, ['district-awards-history'])
    expect(r.status, r.stderr).toBe(0)
    const body = fs.readFileSync(
      path.join(cache, 'district-awards-history.json')
    )
    expect(body.equals(doc(7))).toBe(true)
  })

  it('fails when district-awards-history cannot be fetched', () => {
    putObject('district-awards-history.json', doc(7))
    const r = run(SYNC, ['district-awards-history'], {
      SHIM_FAIL_MATCH: '^cp ',
    })
    expect(r.status).not.toBe(0)
  })

  it('rejects an unknown store name', () => {
    const r = run(SYNC, ['snapshots'])
    expect(r.status).not.toBe(0)
  })

  it('reports MB downloaded per store in the step summary', () => {
    putObject('club-race/2026-2027/first-reached.json', doc(1))
    const r = run(SYNC, ['club-race'])
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /club-race files\*\*: 1 \(remote 1\), [0-9]+\.[0-9]{1} MB/
    )
  })
})

describe('sync-stores.sh club-trends PY scope (#1728, E2-2)', () => {
  function seedPys(): void {
    putObject('club-trends/2024-2025/district_61.json', doc(1))
    putObject('club-trends/2025-2026/district_61.json', doc(2))
    putObject('club-trends/2025-2026/district_62.json', doc(3))
    putObject('club-trends/2026-2027/district_61.json', doc(4))
  }

  it('pulls only the listed PY prefix', () => {
    seedPys()
    const r = run(SYNC, ['club-trends'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2026-2027',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(localFiles('club-trends')).toEqual(['2026-2027/district_61.json'])
    const c = calls()
    expect(c).toContain(`storage ls gs://${BUCKET}/club-trends/2026-2027/**`)
    expect(
      c.some(l => l.startsWith(`storage rsync -r gs://${BUCKET}/club-trends/ `))
    ).toBe(false)
    expect(fs.readFileSync(summary, 'utf-8')).toContain(
      'club-trends/2026-2027 files**: 1 (remote 1)'
    )
  })

  it('July: pulls the prior and the new PY, nothing older', () => {
    seedPys()
    const r = run(SYNC, ['club-trends'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2025-2026 2026-2027',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(localFiles('club-trends')).toEqual([
      '2025-2026/district_61.json',
      '2025-2026/district_62.json',
      '2026-2027/district_61.json',
    ])
  })

  it('a PY with no objects yet is a first run for that PY, not a failure', () => {
    putObject('club-trends/2025-2026/district_61.json', doc(2))
    const r = run(SYNC, ['club-trends'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2026-2027',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(fs.existsSync(path.join(cache, 'club-trends'))).toBe(true)
    expect(localFiles('club-trends')).toEqual([])
  })

  it('stays fail-closed on a short download of a scoped PY', () => {
    seedPys()
    const r = run(SYNC, ['club-trends'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2025-2026',
      SHIM_DOWNLOAD_SKIP: 'district_62',
    })
    expect(r.status).not.toBe(0)
  })

  it('stays fail-closed on a listing error for a scoped PY', () => {
    seedPys()
    const r = run(SYNC, ['club-trends'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2026-2027',
      SHIM_FAIL_MATCH: '^ls ',
    })
    expect(r.status).not.toBe(0)
  })

  it('"all" pulls the whole store, as before', () => {
    seedPys()
    const r = run(SYNC, ['club-trends'], { CLUB_TRENDS_PROGRAM_YEARS: 'all' })
    expect(r.status, r.stderr).toBe(0)
    expect(localFiles('club-trends')).toHaveLength(4)
  })

  for (const bad of ['2026', '2026-2028', '../time-series', '2026-2027,x']) {
    it(`refuses a malformed PY list (${bad}) with a usage error`, () => {
      seedPys()
      const r = run(SYNC, ['club-trends'], { CLUB_TRENDS_PROGRAM_YEARS: bad })
      expect(r.status).toBe(2)
      expect(localFiles('club-trends')).toEqual([])
    })
  }

  it('does not scope any other store', () => {
    putObject('time-series/2024-2025/district_61.json', doc(1))
    putObject('time-series/2026-2027/district_61.json', doc(2))
    const r = run(SYNC, ['time-series'], {
      CLUB_TRENDS_PROGRAM_YEARS: '2026-2027',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(localFiles('time-series')).toHaveLength(2)
  })
})

describe('publish-stores.sh (#1722)', () => {
  function seedLocal(store: string, rel: string, content: Buffer): void {
    const f = path.join(cache, store, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content)
  }

  it('publishes time-series as exactly one gzip layer of JSON with CDN headers', () => {
    seedLocal('time-series', '2026-2027/district_61.json', doc(61))
    const r = run(PUBLISH, ['time-series'])
    expect(r.status, r.stderr).toBe(0)
    const obj = 'time-series/2026-2027/district_61.json'
    const once = zlib.gunzipSync(readObject(obj))
    expect(once.equals(doc(61))).toBe(true)
    expect(JSON.parse(once.toString('utf-8'))).toMatchObject({
      districtId: '61',
    })
    const meta = readMeta(obj)
    expect(meta).toContain('content-encoding=gzip')
    expect(meta).toContain('content-type=application/json')
    expect(meta).toContain('cache-control=public, max-age=3600')
  })

  it('publishes club-trends, club-race and awards history as plain JSON', () => {
    seedLocal('club-trends', '2026-2027/district_61.json', doc(1))
    seedLocal('club-race', '2026-2027/first-reached.json', doc(2))
    fs.writeFileSync(path.join(cache, 'district-awards-history.json'), doc(3))
    const r = run(PUBLISH, [
      'club-trends',
      'club-race',
      'district-awards-history',
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(
      readObject('club-trends/2026-2027/district_61.json').equals(doc(1))
    ).toBe(true)
    expect(
      readObject('club-race/2026-2027/first-reached.json').equals(doc(2))
    ).toBe(true)
    expect(readObject('district-awards-history.json').equals(doc(3))).toBe(true)
  })

  it('refuses gzip bytes on disk before pushing anything', () => {
    seedLocal('club-race', '2026-2027/first-reached.json', doc(2))
    seedLocal(
      'time-series',
      '2026-2027/district_61.json',
      gzipTimes(doc(61), 1)
    )
    const r = run(PUBLISH, ['club-race', 'time-series'])
    expect(r.status).not.toBe(0)
    expect(calls()).toEqual([])
  })

  it('fails on a transport error during the push', () => {
    seedLocal('club-trends', '2026-2027/district_61.json', doc(1))
    const r = run(PUBLISH, ['club-trends'], { SHIM_FAIL_MATCH: '^rsync ' })
    expect(r.status).not.toBe(0)
  })

  it('fails when asked to publish a store that was never synced', () => {
    const r = run(PUBLISH, ['club-race'])
    expect(r.status).not.toBe(0)
    expect(calls()).toEqual([])
  })

  describe('time-series: one upload path, changed files only (#1731, E2-1)', () => {
    const A = 'district_61/2025-2026.json'
    const B = 'district_61/2026-2027.json'
    const sha = (b: Buffer): string =>
      createHash('sha256').update(b).digest('hex')
    const tsUploads = (): string[] =>
      calls().filter(l => /^storage cp .*gs:\/\/[^ ]+\/time-series\//.test(l))

    it('tags each object with x-goog-meta-sha256 of its uncompressed content', () => {
      seedLocal('time-series', A, doc(60))
      const r = run(PUBLISH, ['time-series'])
      expect(r.status, r.stderr).toBe(0)
      expect(readMeta(`time-series/${A}`)).toContain(
        `x-goog-meta-sha256=${sha(doc(60))}`
      )
    })

    it('never rsyncs time-series: the -Z upload is the only write', () => {
      seedLocal('time-series', A, doc(60))
      expect(run(PUBLISH, ['time-series']).status).toBe(0)
      expect(
        calls().filter(l => /^storage rsync .*time-series/.test(l))
      ).toEqual([])
    })

    it('does not re-upload an unchanged file on the next run', () => {
      seedLocal('time-series', A, doc(60))
      seedLocal('time-series', B, doc(61))
      expect(run(PUBLISH, ['time-series']).status).toBe(0)
      const before = readObject(`time-series/${A}`)
      fs.writeFileSync(log, '')
      fs.writeFileSync(summary, '')

      const r = run(PUBLISH, ['time-series'])
      expect(r.status, r.stderr).toBe(0)
      expect(tsUploads()).toEqual([])
      expect(readObject(`time-series/${A}`).equals(before)).toBe(true)
      expect(fs.readFileSync(summary, 'utf-8')).toMatch(
        /0 uploaded, 2 unchanged/
      )
    })

    it('uploads only the changed file, as exactly one gzip layer', () => {
      seedLocal('time-series', A, doc(60))
      seedLocal('time-series', B, doc(61))
      expect(run(PUBLISH, ['time-series']).status).toBe(0)
      fs.writeFileSync(log, '')
      fs.writeFileSync(summary, '')
      seedLocal('time-series', B, doc(62))

      const r = run(PUBLISH, ['time-series'])
      expect(r.status, r.stderr).toBe(0)
      const ups = tsUploads()
      expect(ups).toHaveLength(1)
      expect(ups[0]).toContain(`gs://${BUCKET}/time-series/${B}`)
      const once = zlib.gunzipSync(readObject(`time-series/${B}`))
      expect(once.equals(doc(62))).toBe(true)
      const meta = readMeta(`time-series/${B}`)
      expect(meta).toContain('content-encoding=gzip')
      expect(meta).toContain('content-type=application/json')
      expect(meta).toContain('cache-control=public, max-age=3600')
      expect(meta).toContain(`x-goog-meta-sha256=${sha(doc(62))}`)
      expect(fs.readFileSync(summary, 'utf-8')).toMatch(
        /1 uploaded, 1 unchanged/
      )
    })

    it('uploads an existing object that has no sha metadata yet (first run)', () => {
      putObject(`time-series/${A}`, doc(60), 1)
      seedLocal('time-series', A, doc(60))
      const r = run(PUBLISH, ['time-series'])
      expect(r.status, r.stderr).toBe(0)
      expect(tsUploads()).toHaveLength(1)
      expect(readMeta(`time-series/${A}`)).toContain(
        `x-goog-meta-sha256=${sha(doc(60))}`
      )
    })

    it('fails closed, uploading nothing, when the remote listing fails', () => {
      seedLocal('time-series', A, doc(60))
      const r = run(PUBLISH, ['time-series'], {
        SHIM_FAIL_MATCH: '^objects list ',
      })
      expect(r.status).not.toBe(0)
      expect(tsUploads()).toEqual([])
    })

    it('fails when the bucket is missing (gcloud prints [] but exits 1)', () => {
      seedLocal('time-series', A, doc(60))
      fs.rmSync(path.join(root, BUCKET), { recursive: true })
      const r = run(PUBLISH, ['time-series'])
      expect(r.status).not.toBe(0)
      expect(tsUploads()).toEqual([])
    })

    it('fails on a transport error during an upload', () => {
      seedLocal('time-series', A, doc(60))
      seedLocal('time-series', B, doc(61))
      const r = run(PUBLISH, ['time-series'], {
        SHIM_FAIL_MATCH: `^cp .*time-series/${B}$`,
      })
      expect(r.status).not.toBe(0)
    })

    it("the shim's objects-list keys are a subset of the real SDK's", () => {
      seedLocal('time-series', A, doc(60))
      expect(run(PUBLISH, ['time-series']).status).toBe(0)
      const r = spawnSync(
        path.join(SHIM_DIR, 'gcloud'),
        [
          'storage',
          'objects',
          'list',
          `gs://${BUCKET}/time-series/**`,
          '--format=json',
        ],
        { encoding: 'utf-8', env: { ...process.env, SHIM_ROOT: root } }
      )
      expect(r.status, r.stderr).toBe(0)
      const shimEntries = JSON.parse(r.stdout) as Record<string, unknown>[]
      expect(shimEntries).toHaveLength(1)
      const realKeys = new Set(
        ['staging-live.json', 'prod-noncurrent-and-custom-fields.json'].flatMap(
          f =>
            (
              JSON.parse(
                fs.readFileSync(
                  path.join(SHIM_DIR, '../gcloud-objects-list', f),
                  'utf-8'
                )
              ) as Record<string, unknown>[]
            ).flatMap(e => Object.keys(e))
        )
      )
      for (const k of Object.keys(shimEntries[0])) {
        expect(realKeys.has(k), k).toBe(true)
      }
      expect(shimEntries[0].custom_fields).toEqual({
        sha256: sha(doc(60)),
      })
    })
  })

  for (const decompress of ['0', '1']) {
    const sdk = decompress === '1' ? 'gcloud 588' : 'gcloud 568'
    it(`a sync → publish round trip from a 10-layer store ends at one layer (${sdk})`, () => {
      const obj = 'time-series/2025-2026/district_61.json'
      putObject(obj, doc(60), 10)
      const env = { SHIM_DOWNLOAD_DECOMPRESS: decompress }
      expect(run(SYNC, ['time-series'], env).status).toBe(0)
      const r = run(PUBLISH, ['time-series'], env)
      expect(r.status, r.stderr).toBe(0)
      const once = zlib.gunzipSync(readObject(obj))
      expect(once.equals(doc(60))).toBe(true)
    })
  }
})
