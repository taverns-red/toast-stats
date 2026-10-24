/**
 * The local pipeline harness's own library (#1768, ADR-015 step 10, P3-2):
 * the shim-backed SDK bucket, the fixture corpus and the prod-twin
 * assertions. Fast and in-process, so it runs in `test:scripts` on every PR.
 * The end-to-end mode runs live in scripts/harness/ and run in their own
 * path-filtered CI job (.github/workflows/pipeline-harness.yml).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { parse } from 'yaml'
import {
  HARNESS_DISTRICTS,
  HARNESS_PROD,
  HARNESS_STAGING,
  FIXTURE_DATES,
  createWorld,
  gzipLayers,
  prodTwinViolations,
  readBucket,
  shimGateBucket,
  type World,
} from '../pipelineHarness.js'

const REPO = process.cwd()
const RECORDED = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO,
      'scripts/lib/__tests__/fixtures/gcs-get-files/with-fields.json'
    ),
    'utf-8'
  )
) as { items: Array<Record<string, string>> }

let template: string
let tmp: string
let world: World

// The corpus is built once (it runs the harness collector-cli); each test
// gets a byte-for-byte copy to mutate.
beforeAll(() => {
  template = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lib-template-'))
  createWorld(template)
})

afterAll(() => {
  fs.rmSync(template, { recursive: true, force: true })
})

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lib-'))
  fs.cpSync(template, tmp, { recursive: true, verbatimSymlinks: true })
  world = {
    dir: tmp,
    root: path.join(tmp, 'gcs'),
    cache: path.join(tmp, 'cache'),
    bin: path.join(tmp, 'bin'),
  }
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Write one object straight into a shim bucket. */
function put(bucket: string, p: string, bytes: Buffer, gzip: boolean): void {
  const obj = path.join(world.root, bucket, p)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const meta = path.join(world.root, '.meta', bucket, p)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(meta, gzip ? 'content-encoding=gzip\n' : '')
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v))

describe('shimGateBucket answers like @google-cloud/storage 8.2.0 (#1727)', () => {
  it('with `fields`: plain items, keyed exactly like the recorded listing', async () => {
    const b = shimGateBucket(world.root, HARNESS_PROD)
    const [items] = (await b.getFiles({
      prefix: `snapshots/${FIXTURE_DATES.daily}/`,
      fields: 'items(name,size,crc32c,md5Hash,contentEncoding),nextPageToken',
    })) as [Array<Record<string, unknown>>]
    expect(items.length).toBeGreaterThan(0)
    const gz = RECORDED.items.find(i => i.contentEncoding)!
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(Object.keys(gz).sort())
      expect(typeof item.size).toBe('string')
    }
  })

  it('an object stored without an encoding has no contentEncoding key', async () => {
    put(HARNESS_STAGING, 'v1/plain.json', json({ a: 1 }), false)
    const b = shimGateBucket(world.root, HARNESS_STAGING)
    const [items] = (await b.getFiles({
      prefix: 'v1/',
      fields: 'items(name,size,crc32c,md5Hash,contentEncoding),nextPageToken',
    })) as [Array<Record<string, unknown>>]
    const plain = RECORDED.items.find(i => !i.contentEncoding)!
    expect(Object.keys(items[0]!).sort()).toEqual(Object.keys(plain).sort())
  })

  it('with a delimiter: the sub-prefixes in the raw response (third element)', async () => {
    const b = shimGateBucket(world.root, HARNESS_PROD)
    const r = (await b.getFiles({
      prefix: 'snapshots/',
      delimiter: '/',
      autoPaginate: false,
    })) as [unknown[], unknown, { prefixes?: string[] }]
    expect(r[2].prefixes).toEqual([
      `snapshots/${FIXTURE_DATES.historical}/`,
      `snapshots/${FIXTURE_DATES.daily}/`,
    ])
  })

  it('downloads the stored bytes, never decompressed', async () => {
    const b = shimGateBucket(world.root, HARNESS_PROD)
    const name = `snapshots/${FIXTURE_DATES.daily}/district_61.json`
    const [bytes] = await b.file(name).download({ decompress: false })
    expect(gzipLayers(Buffer.from(bytes))).toBe(1)
  })
})

describe('the fixture corpus (ADR-015 "Harness requirements")', () => {
  const dir = (bucket: string, prefix: string) =>
    [...readBucket(world.root, bucket).keys()].filter(k => k.startsWith(prefix))

  it('holds 3 districts × 2 dates in staging and prod, one SHIM_ROOT', () => {
    expect(HARNESS_DISTRICTS).toHaveLength(3)
    for (const bucket of [HARNESS_STAGING, HARNESS_PROD]) {
      for (const date of Object.values(FIXTURE_DATES)) {
        for (const id of HARNESS_DISTRICTS) {
          expect(
            dir(bucket, `snapshots/${date}/district_${id}.json`)
          ).toHaveLength(1)
        }
      }
    }
  })

  it('one date has one district’s raw missing', () => {
    const missing = HARNESS_DISTRICTS.filter(
      id =>
        dir(
          HARNESS_STAGING,
          `raw-csv/${FIXTURE_DATES.historical}/district-${id}/`
        ).length === 0
    )
    expect(missing).toEqual(['201'])
    for (const id of HARNESS_DISTRICTS) {
      expect(
        dir(HARNESS_STAGING, `raw-csv/${FIXTURE_DATES.daily}/district-${id}/`)
      ).not.toEqual([])
    }
  })

  it('one date has persisted FAC, the other has none', () => {
    expect(
      dir(HARNESS_STAGING, `raw-fac/${FIXTURE_DATES.historical}/`)
    ).toHaveLength(3)
    expect(dir(HARNESS_STAGING, `raw-fac/${FIXTURE_DATES.daily}/`)).toEqual([])
  })

  it('prod copies are FAC-enriched (26-key clubs: 28 recorded, less the #2026 contact keys) where staging holds the stripped 17-key ones', () => {
    const clubKeys = (bucket: string) => {
      const o = readBucket(world.root, bucket).get(
        `snapshots/${FIXTURE_DATES.daily}/district_02.json`
      )!
      const v = JSON.parse(zlib.gunzipSync(o.bytes).toString('utf-8'))
      return Math.max(...v.data.clubs.map((c: object) => Object.keys(c).length))
    }
    expect(clubKeys(HARNESS_PROD)).toBe(26)
    expect(clubKeys(HARNESS_STAGING)).toBe(17)
  })

  it('a club-trends store spanning a whole PY, and a two-layer gzip object in the current one', () => {
    const store = readBucket(world.root, HARNESS_STAGING)
    const whole = store.get('club-trends/2025-2026/district_61.json')!
    const v = JSON.parse(whole.bytes.toString('utf-8'))
    const dates = Object.values(
      v.clubs as Record<string, { membershipTrend: Array<{ date: string }> }>
    )
      .flatMap(c => c.membershipTrend.map(p => p.date))
      .sort()
    expect(dates[0]).toBe('2025-07-01')
    expect(dates[dates.length - 1]).toBe('2026-06-30')
    const nested = store.get('club-trends/2026-2027/district_61.json')!
    expect(nested.contentEncoding).toBe('gzip')
    expect(gzipLayers(nested.bytes)).toBe(2)
  })

  it('the truncated option seeds a truncated store object', () => {
    const t = createWorld(path.join(tmp, 'trunc'), { truncatedStore: true })
    const o = readBucket(t.root, HARNESS_STAGING).get(
      'club-trends/2026-2027/district_02.json'
    )!
    expect(() => JSON.parse(o.bytes.toString('utf-8'))).toThrow()
  })
})

describe('prodTwinViolations: every prod object after promote', () => {
  const P = `snapshots/${FIXTURE_DATES.daily}/district_61.json`

  function promote(p: string): void {
    const s = path.join(world.root, HARNESS_STAGING, p)
    const d = path.join(world.root, HARNESS_PROD, p)
    fs.mkdirSync(path.dirname(d), { recursive: true })
    fs.copyFileSync(s, d)
    fs.copyFileSync(
      path.join(world.root, '.meta', HARNESS_STAGING, p),
      path.join(world.root, '.meta', HARNESS_PROD, p)
    )
  }

  it('passes an untouched prod and a faithful server-side copy', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    expect(prodTwinViolations(world, before, [])).toEqual([])
    promote(P)
    expect(prodTwinViolations(world, before, [P])).toEqual([])
  })

  it('flags a promoted object that never reached prod', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    fs.rmSync(path.join(world.root, HARNESS_PROD, P))
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: promoted but absent from prod/
    )
  })

  it('flags a prod object whose bytes differ from staging’s (sha256)', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    put(HARNESS_PROD, P, zlib.gzipSync(json({ data: { other: true } })), true)
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: sha256 .* differs from staging/
    )
  })

  it('flags a changed prod object the run did not promote', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    promote(P)
    expect(prodTwinViolations(world, before, []).join('\n')).toMatch(
      /district_61\.json: changed in prod but not promoted by this run/
    )
  })

  it('flags two gzip layers (#1702)', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    put(HARNESS_STAGING, P, zlib.gzipSync(zlib.gzipSync(json({ a: 1 }))), true)
    promote(P)
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: 2 gzip layers, want exactly 1/
    )
  })

  it('flags a CDN object stored with no gzip layer', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    put(HARNESS_STAGING, P, json({ a: 1 }), false)
    promote(P)
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: 0 gzip layers, want exactly 1/
    )
  })

  it('flags a truncated object', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    const whole = zlib.gzipSync(json({ data: { clubs: [] } }))
    put(HARNESS_STAGING, P, whole.subarray(0, whole.length - 6), true)
    promote(P)
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: does not decode/
    )
  })

  it('flags JSON that does not parse', () => {
    const before = readBucket(world.root, HARNESS_PROD)
    put(HARNESS_STAGING, P, zlib.gzipSync(Buffer.from('{"data":')), true)
    promote(P)
    expect(prodTwinViolations(world, before, [P]).join('\n')).toMatch(
      /district_61\.json: does not parse as JSON/
    )
  })
})

describe('the harness CI job (#1768)', () => {
  const wf = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/pipeline-harness.yml'),
      'utf-8'
    )
  ) as {
    on: Record<string, { paths?: string[] }>
    jobs: Record<
      string,
      { steps: Array<{ run?: string }>; 'timeout-minutes'?: number }
    >
  }

  it('runs on a PR or push that touches the pipeline, its scripts or the collector-cli services', () => {
    for (const event of ['pull_request', 'push']) {
      expect(wf.on[event]?.paths).toEqual(
        expect.arrayContaining([
          '.github/workflows/data-pipeline.yml',
          'scripts/pipeline/**',
          'scripts/lib/**',
          'packages/collector-cli/src/services/**',
        ])
      )
    }
  })

  it('runs the harness suite, with a bounded job time', () => {
    const jobs = Object.values(wf.jobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.steps.map(s => s.run ?? '').join('\n')).toContain(
      'npm run test:pipeline-harness'
    )
    expect(jobs[0]!['timeout-minutes']).toBeLessThanOrEqual(15)
  })

  it('the harness suite is its own vitest partition: not in test:scripts, and found by its config', async () => {
    const scriptsCfg = (await import('../../vitest.config.js')).default as {
      test: { include: string[] }
    }
    const harnessCfg = (await import('../../harness/vitest.config.js'))
      .default as {
      test: { include: string[] }
    }
    const e2e = 'scripts/harness/__tests__/pipelineHarness.e2e.test.ts'
    expect(fs.existsSync(path.join(REPO, e2e))).toBe(true)
    const { default: picomatch } = await import('picomatch')
    expect(scriptsCfg.test.include.some(g => picomatch(g)(e2e))).toBe(false)
    expect(harnessCfg.test.include.some(g => picomatch(g)(e2e))).toBe(true)
  })

  it('package.json exposes pipeline:local and test:pipeline-harness', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')
    )
    expect(pkg.scripts['pipeline:local']).toBe('tsx scripts/pipeline-local.ts')
    expect(pkg.scripts['test:pipeline-harness']).toBe(
      'vitest run --config scripts/harness/vitest.config.ts'
    )
  })
})
