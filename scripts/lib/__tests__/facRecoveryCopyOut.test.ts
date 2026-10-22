/**
 * scripts/ops/fac-recovery-2239-copy-out.sh (#2239): copies the enriched,
 * soft-deleted generations of snapshots/<date>/district_<id>.json out to
 * the private recovery bucket, per object: restore E over the live L
 * (--if-generation-match=L), server-side cp of the restored R to
 * fac-2239/<date>/ (--no-clobber, then an md5 check against E), restore L
 * back (--if-generation-match=R, then an md5 check against L).
 *
 * Runs the REAL script against the gcloud shim with SHIM_GENERATIONS=1
 * (generations and soft delete, as the JSON API documents them). The
 * listing keys the script reads (name, generation, size, md5_hash) are the
 * ones recorded from the real SDK in
 * fixtures/gcloud-objects-list/staging-soft-deleted.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/ops/fac-recovery-2239-copy-out.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const REAL_SOFT = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-objects-list/staging-soft-deleted.json'
)
const STAGING = 'toast-stats-data-staging'
const PROD = 'toast-stats-data-ca'
const DEST = 'toast-stats-fac-recovery-2239'

let tmp: string
let root: string
let shimLog: string
let ghStub: string

type Json = Record<string, unknown>

function md5(bytes: Buffer): string {
  return crypto.createHash('md5').update(bytes).digest('base64')
}

/** A gzip district file of roughly `kb` KiB stored (incompressible body). */
function body(kb: number, seed: string): Buffer {
  const filler = crypto
    .createHash('sha512')
    .update(seed)
    .digest('hex')
    .repeat(1)
  let s = ''
  let i = 0
  while (s.length < kb * 1024) {
    s += crypto.createHash('sha256').update(`${filler}${i++}`).digest('base64')
  }
  return zlib.gzipSync(JSON.stringify({ seed, s }))
}

function putLive(bucket: string, name: string, bytes: Buffer, gen: string) {
  const obj = path.join(root, bucket, name)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const meta = path.join(root, '.meta', bucket, name)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `content-encoding=gzip\ncontent-type=application/json\ngeneration=${gen}\n`
  )
}

function putSoft(bucket: string, name: string, bytes: Buffer, gen: string) {
  const obj = path.join(root, '.soft', bucket, `${name}#${gen}`)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const meta = path.join(root, '.soft-meta', bucket, `${name}#${gen}`)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `content-encoding=gzip\ncontent-type=application/json\ngeneration=${gen}\nsoft-delete-time=2026-10-07T11:28:03+0000\n`
  )
}

function liveBytes(bucket: string, name: string): Buffer | undefined {
  const f = path.join(root, bucket, name)
  return fs.existsSync(f) ? fs.readFileSync(f) : undefined
}

function liveMeta(bucket: string, name: string): string {
  return fs.readFileSync(path.join(root, '.meta', bucket, name), 'utf-8')
}

interface Seeded {
  name: string
  enriched: Buffer
  E: string
  live: Buffer
  L: string
}

/**
 * One date as #2237's strip left it: live L (stripped, small), the enriched
 * E soft-deleted (2.1x), an older pre-enrichment generation and a later
 * stripped one also soft-deleted, plus a reports sidecar (never copied).
 */
function seedDate(bucket: string, date: string, ids: string[]): Seeded[] {
  fs.mkdirSync(path.join(root, DEST), { recursive: true })
  return ids.map((id, n) => {
    const name = `snapshots/${date}/district_${id}.json`
    const base = 1781615174895950 + n * 10
    const older = body(10, `${name}-older`)
    const enriched = body(21, `${name}-enriched`)
    const stripped1 = body(10, `${name}-stripped1`)
    const live = body(10, `${name}-live`)
    putSoft(bucket, name, older, String(base - 5))
    putSoft(bucket, name, enriched, String(base))
    putSoft(bucket, name, stripped1, String(base + 9_757_308_196_904))
    putLive(bucket, name, live, String(base + 10_364_050_235_389))
    const sidecar = `snapshots/${date}/district_${id}_reports.json`
    putLive(bucket, sidecar, body(3, sidecar), String(base + 1))
    putSoft(bucket, sidecar, body(9, `${sidecar}-old`), String(base + 2))
    return {
      name,
      enriched,
      E: String(base),
      live,
      L: String(base + 10_364_050_235_389),
    }
  })
}

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      GH: ghStub,
      SHIM_ROOT: root,
      SHIM_LOG: shimLog,
      SHIM_GENERATIONS: '1',
      STUB_GH_RUNNING: '0',
      ...env,
    },
  })
  const out = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Json)
  return {
    status: r.status,
    stderr: r.stderr,
    plan: out.filter(o => o.type === 'plan'),
    results: out.filter(o => o.type === 'result'),
    summary: out.find(o => o.type === 'summary'),
  }
}

function calls(): string[] {
  return fs.existsSync(shimLog)
    ? fs.readFileSync(shimLog, 'utf-8').split('\n').filter(Boolean)
    : []
}

const writes = () =>
  calls().filter(l => /^storage (restore|cp|rm|rsync)\b/.test(l))

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fac-copy-out-'))
  root = path.join(tmp, 'gcs')
  shimLog = path.join(tmp, 'gcloud.log')
  ghStub = path.join(tmp, 'gh')
  // `gh run list --workflow data-pipeline.yml --status in_progress --json
  // databaseId --jq length` prints the number of runs in progress.
  fs.writeFileSync(
    ghStub,
    '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >>"${STUB_GH_LOG:-/dev/null}"\necho "${STUB_GH_RUNNING:-0}"\n'
  )
  fs.chmodSync(ghStub, 0o755)
  fs.mkdirSync(path.join(root, STAGING), { recursive: true })
  fs.mkdirSync(path.join(root, PROD), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('the shim speaks the recorded SDK listing shape', () => {
  it('lists soft-deleted generations with the real keys the script reads', () => {
    const real = JSON.parse(fs.readFileSync(REAL_SOFT, 'utf-8')) as Json[]
    const realKeys = new Set(real.flatMap(e => Object.keys(e)))
    seedDate(STAGING, '2026-06-15', ['61'])
    const r = spawnSync(
      'bash',
      [
        SHIM,
        'storage',
        'objects',
        'list',
        `gs://${STAGING}/snapshots/2026-06-15/district_61.json`,
        '--soft-deleted',
        '--format=json',
      ],
      { encoding: 'utf-8', env: { ...process.env, SHIM_ROOT: root } }
    )
    const shim = JSON.parse(r.stdout) as Json[]
    expect(shim).toHaveLength(3)
    for (const k of ['name', 'generation', 'size', 'md5_hash']) {
      expect(realKeys.has(k), k).toBe(true)
      expect(shim[0]).toHaveProperty(k)
    }
    for (const k of Object.keys(shim[0]!)) expect(realKeys.has(k), k).toBe(true)
    // The real generations are strings, the size a number.
    expect(typeof real[0]!.generation).toBe('string')
    expect(typeof real[0]!.size).toBe('number')
    expect(typeof shim[0]!.generation).toBe('string')
    expect(typeof shim[0]!.size).toBe('number')
  })
})

describe('copy-out: usage and guards', () => {
  it('needs a bucket and at least one date', () => {
    expect(run([]).status).toBe(2)
    expect(run([STAGING]).status).toBe(2)
    expect(run([STAGING, '2026-6-15']).status).toBe(2)
    expect(run(['--bogus', STAGING, '2026-06-15']).status).toBe(2)
    expect(calls()).toEqual([])
  })

  it(`refuses ${PROD} without --allow-prod, before any call`, () => {
    seedDate(PROD, '2026-05-30', ['01'])
    const r = run([PROD, '2026-05-30'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--allow-prod')
    expect(calls()).toEqual([])
    const ok = run(['--allow-prod', PROD, '2026-05-30'])
    expect(ok.status, ok.stderr).toBe(0)
    expect(ok.plan).toHaveLength(1)
  })

  it('refuses the recovery bucket itself as the source', () => {
    expect(run([DEST, '2026-06-15']).status).toBe(2)
  })
})

describe('copy-out: dry run (the default)', () => {
  it('prints the plan from a fresh listing and writes nothing', () => {
    const seeded = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run([STAGING, '2026-06-15'])
    expect(r.status, r.stderr).toBe(0)
    expect(writes()).toEqual([])
    // Only district_<id>.json, never the _reports sidecar.
    expect(r.plan.map(p => p.name)).toEqual(seeded.map(s => s.name))
    const first = r.plan[0]!
    expect(first).toMatchObject({
      type: 'plan',
      date: '2026-06-15',
      bucket: STAGING,
      name: seeded[0]!.name,
      action: 'copy',
      enriched: {
        generation: seeded[0]!.E,
        md5: md5(seeded[0]!.enriched),
        size: seeded[0]!.enriched.length,
      },
      live: {
        generation: seeded[0]!.L,
        md5: md5(seeded[0]!.live),
        size: seeded[0]!.live.length,
      },
      destination: `gs://${DEST}/fac-2239/2026-06-15/district_61.json`,
    })
    expect(r.summary).toMatchObject({
      type: 'summary',
      execute: false,
      bucket: STAGING,
      dates: 1,
      objects: 2,
      copy: 2,
      done: 0,
      noCandidate: 0,
      conflict: 0,
      manifestMismatch: 0,
      bytes: seeded.reduce((n, s) => n + s.enriched.length, 0),
    })
  })

  it('a district with no generation above 1.5x the live size is no-candidate', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    const name = 'snapshots/2026-06-15/district_99.json'
    putLive(STAGING, name, body(10, 'live99'), '1791979225131339')
    putSoft(STAGING, name, body(12, 'soft99'), '1781615174895000')
    const r = run([STAGING, '2026-06-15'])
    expect(r.status).toBe(0)
    expect(r.plan.find(p => p.name === name)).toMatchObject({
      action: 'no-candidate',
      enriched: null,
    })
    expect(r.summary).toMatchObject({ copy: 1, noCandidate: 1 })
  })

  it('cross-checks the stored manifest: a generation mismatch blocks', () => {
    const [s] = seedDate(STAGING, '2026-06-15', ['61'])
    const manifest = path.join(tmp, 'manifest.json')
    fs.writeFileSync(
      manifest,
      JSON.stringify([
        {
          group: 'B',
          date: '2026-06-15',
          bucket: STAGING,
          name: s!.name,
          generation: '1781615174890000',
          size: s!.enriched.length,
          md5: md5(s!.enriched),
          hard_delete: '2026-11-06T11:28:03+0000',
        },
      ])
    )
    const r = run(['--manifest', manifest, STAGING, '2026-06-15'])
    expect(r.status).toBe(1)
    expect(r.plan[0]).toMatchObject({ action: 'manifest-mismatch' })
    const x = run(['--execute', '--manifest', manifest, STAGING, '2026-06-15'])
    expect(x.status).toBe(1)
    expect(writes()).toEqual([])
  })

  it('an existing copy with another md5 is a conflict that blocks', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    putLive(
      DEST,
      'fac-2239/2026-06-15/district_61.json',
      body(5, 'other'),
      '1792000000000000'
    )
    const r = run([STAGING, '2026-06-15'])
    expect(r.status).toBe(1)
    expect(r.plan[0]).toMatchObject({ action: 'conflict' })
  })
})

describe('copy-out: --execute', () => {
  it('copies every enriched generation out and leaves the live bytes as they were', () => {
    const seeded = [
      ...seedDate(STAGING, '2026-06-15', ['61', '62']),
      ...seedDate(STAGING, '2026-10-08', ['61']),
    ]
    const r = run(['--execute', STAGING, '2026-06-15', '2026-10-08'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.summary).toMatchObject({
      type: 'summary',
      execute: true,
      done: 3,
      failed: 0,
      stuck: [],
    })
    for (const s of seeded) {
      const dest = s.name.replace('snapshots/', 'fac-2239/')
      expect(md5(liveBytes(DEST, dest)!)).toBe(md5(s.enriched))
      // A server-side copy keeps the stored encoding.
      expect(liveMeta(DEST, dest)).toContain('content-encoding=gzip')
      // The live object is the stripped bytes again, under a new generation.
      expect(md5(liveBytes(STAGING, s.name)!)).toBe(md5(s.live))
      expect(liveMeta(STAGING, s.name)).not.toContain(`generation=${s.L}\n`)
    }
    // Every restore carried its live-object precondition.
    const restores = calls().filter(l => l.startsWith('storage restore '))
    expect(restores).toHaveLength(6)
    for (const l of restores) expect(l).toMatch(/ --if-generation-match=\d+$/)
    const s0 = seeded[0]!
    expect(restores).toContain(
      `storage restore gs://${STAGING}/${s0.name}#${s0.E} --if-generation-match=${s0.L}`
    )
    // The copy never clobbers.
    for (const l of calls().filter(l => l.startsWith('storage cp '))) {
      expect(l).toContain('--no-clobber')
    }
  })

  it('a rerun finds them done and writes nothing', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    expect(run(['--execute', STAGING, '2026-06-15']).status).toBe(0)
    fs.rmSync(shimLog)
    const again = run(['--execute', STAGING, '2026-06-15'])
    expect(again.status, again.stderr).toBe(0)
    expect(again.plan[0]).toMatchObject({ action: 'done' })
    expect(writes()).toEqual([])
  })

  it('refuses while a data-pipeline run is in progress', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    const r = run(['--execute', STAGING, '2026-06-15'], {
      STUB_GH_RUNNING: '1',
    })
    expect(r.status).toBe(1)
    expect(writes()).toEqual([])
  })

  it('a failed first restore stops the run, with nothing stuck', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run(['--execute', '--parallel', '1', STAGING, '2026-06-15'], {
      SHIM_FAIL_MATCH: `^restore gs://${STAGING}/${a!.name.replace(/[.]/g, '[.]')}#${a!.E}`,
    })
    expect(r.status).toBe(1)
    expect(r.summary).toMatchObject({ done: 0, failed: 1, stuck: [] })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    // Stopped: the second object was never started.
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })

  it('a failed copy stops the run and lists the object stuck mid-step, with its undo', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run(['--execute', '--parallel', '1', STAGING, '2026-06-15'], {
      SHIM_FAIL_MATCH: `^cp .*gs://${DEST}/fac-2239/2026-06-15/district_61[.]json`,
    })
    expect(r.status).toBe(1)
    const stuck = (r.summary!.stuck as Json[])[0]!
    expect(stuck).toMatchObject({
      name: a!.name,
      step: 'restored-enriched',
      live: expect.stringMatching(/^\d+$/),
    })
    expect(stuck.undo).toBe(
      `gcloud storage restore gs://${STAGING}/${a!.name}#${a!.L} --if-generation-match=${stuck.live as string}`
    )
    // The enriched bytes are what is live, so the operator must act.
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.enriched))
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })
})
