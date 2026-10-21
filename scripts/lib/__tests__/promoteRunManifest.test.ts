/**
 * scripts/promote-run-manifest.ts end to end against the gcloud shim, with
 * a staging AND a production bucket in one SHIM_ROOT (#1763, ADR-015 step
 * 5; harness requirement "two buckets").
 *
 * The acceptance shape from the issue: two staged dates, one held by the
 * completeness gate ⇒ only the passing date's objects reach prod; prod
 * objects not in the manifest are untouched; with no hold, v1/ and config/
 * are copied. Plus: the copy is server side (bytes and Content-Encoding
 * carried, no gzip layer added or peeled — the #1702 class), the dry run
 * writes nothing, a re-run converges, and a failed copy never reaches the
 * v1/ entry points.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'

const REPO = process.cwd()
const CLI = path.join(REPO, 'scripts/promote-run-manifest.ts')
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'

let tmp: string
let root: string
let manifestFile: string
let gateFile: string
let shimLog: string
let outputFile: string

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Put an object in a fake bucket; gz=true stores it the way `cp -Z` does. */
function put(bucket: string, p: string, body: string, gz = false): Buffer {
  const raw = Buffer.from(body)
  const obj = path.join(root, bucket, p)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, gz ? zlib.gzipSync(raw) : raw)
  const meta = path.join(root, '.meta', bucket, p)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    (gz ? 'content-encoding=gzip\n' : '') + 'content-type=application/json\n'
  )
  return raw
}

const read = (bucket: string, p: string): Buffer | null => {
  const f = path.join(root, bucket, p)
  return fs.existsSync(f) ? fs.readFileSync(f) : null
}
const meta = (bucket: string, p: string): string | null => {
  const f = path.join(root, '.meta', bucket, p)
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null
}

/** Every object in a bucket → its stored bytes' sha256. */
function tree(bucket: string): Record<string, string> {
  const out: Record<string, string> = {}
  const base = path.join(root, bucket)
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else out[path.relative(base, f)] = sha(fs.readFileSync(f))
    }
  }
  if (fs.existsSync(base)) walk(base)
  return out
}

const manifestLines: string[] = []
/** Stage an object in staging and record it in the run manifest. */
function stage(p: string, body: string, gz = false): void {
  const raw = put(STG, p, body, gz)
  const date = /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null
  manifestLines.push(
    JSON.stringify({ path: p, sha256: sha(raw), date, stage: 'test' })
  )
}

function writeInputs(gate: unknown): void {
  fs.writeFileSync(manifestFile, manifestLines.join('\n') + '\n')
  if (gate !== undefined) fs.writeFileSync(gateFile, JSON.stringify(gate))
}

function runEnv(env: Record<string, string> = {}) {
  return {
    ...process.env,
    GCLOUD: SHIM,
    SHIM_ROOT: root,
    SHIM_LOG: shimLog,
    GCS_BUCKET: STG,
    GCS_BUCKET_PRODUCTION: PROD,
    RUN_MANIFEST_FILE: manifestFile,
    COMPLETENESS_GATE_FILE: gateFile,
    GITHUB_OUTPUT: outputFile,
    GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
    ...env,
  }
}

function readOutputs(): Record<string, string> {
  return Object.fromEntries(
    (fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf-8') : '')
      .split('\n')
      .filter(Boolean)
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  )
}

/**
 * The runner in-process (only the bash shim is spawned): a `tsx` cold start
 * per case timed the file out under a loaded suite (#1748 class). The CLI
 * wiring itself is covered by one real spawn below.
 */
async function run(args: string[], env: Record<string, string> = {}) {
  let stdout = ''
  let stderr = ''
  const status = await runPromoteRunManifest(args, {
    env: runEnv(env),
    out: s => (stdout += s),
    err: s => (stderr += s),
  })
  return { status, stdout, stderr, outputs: readOutputs() }
}

const DATES_JSON = (dates: string[]) =>
  JSON.stringify({ _format: { version: '1.0.0', type: 'dates-index' }, dates })
const LATEST_JSON = (d: string) =>
  JSON.stringify({
    _format: { version: '1.0.0', type: 'manifest' },
    latestSnapshotDate: d,
    generatedAt: '2026-10-12T09:06:52.939Z',
  })

/**
 * Prod already has 2026-10-01 and an older copy of 2026-10-10. The run
 * re-derives 2026-10-10 and adds 2026-10-11, plus the globals over both,
 * the internal stores, and the staging-only identity history.
 */
function scenario(): void {
  fs.mkdirSync(path.join(root, PROD), { recursive: true })
  put(PROD, 'snapshots/2026-10-01/district_61.json', '{"prod":"10-01"}', true)
  put(PROD, 'snapshots/2026-10-10/district_61.json', '{"prod":"10-10"}', true)
  put(PROD, 'v1/dates.json', DATES_JSON(['2026-10-01', '2026-10-10']))
  put(PROD, 'v1/latest.json', LATEST_JSON('2026-10-10'))
  put(PROD, 'club-trends/2026-2027/district_61.json', '{"prod-store":1}', true)

  stage('snapshots/2026-10-10/district_61.json', '{"stg":"10-10"}', true)
  stage('snapshots/2026-10-11/district_61.json', '{"stg":"10-11"}', true)
  stage(
    'snapshots/2026-10-11/analytics/district_61_analytics.json',
    '{"a":1}',
    true
  )
  stage('time-series/district_61/2026-2027.json', '{"ts":1}', true)
  stage('v1/rank-history/61.json', '{"rh":1}')
  stage('v1/dates.json', DATES_JSON(['2026-10-01', '2026-10-10', '2026-10-11']))
  stage('v1/latest.json', LATEST_JSON('2026-10-11'))
  stage('config/district-snapshot-index.json', '{"idx":1}')
  stage('club-trends/2026-2027/district_61.json', '{"stg-store":1}', true)
  stage('derived/district-region-history.json', '{"derived":1}')
  stage('raw-csv/2026-10-11/all-districts.csv', 'a,b\n')
  // In staging but NOT in this run's manifest (an earlier run left it):
  // whole-prefix rsync would have shipped it; scoped promotion must not.
  put(STG, 'snapshots/2026-10-11/district_99.json', '{"unread":1}', true)
  put(STG, 'snapshots/2026-09-30/district_61.json', '{"unread":1}', true)
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-manifest-'))
  root = path.join(tmp, 'gcs')
  fs.mkdirSync(path.join(root, STG), { recursive: true })
  manifestFile = path.join(tmp, 'written.jsonl')
  gateFile = path.join(tmp, 'completeness-gate.json')
  shimLog = path.join(tmp, 'shim.log')
  outputFile = path.join(tmp, 'github-output')
  manifestLines.length = 0
  scenario()
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('promote-run-manifest --execute: one date held', () => {
  it('copies only the passing date; the held date, globals and unread objects stay put', async () => {
    writeInputs({ promote: false, heldDates: ['2026-10-10'] })
    const before = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)

    // The passing date arrived, byte for byte, still one gzip layer.
    for (const p of [
      'snapshots/2026-10-11/district_61.json',
      'snapshots/2026-10-11/analytics/district_61_analytics.json',
    ]) {
      expect(read(PROD, p)).toEqual(read(STG, p))
      expect(meta(PROD, p)).toContain('content-encoding=gzip')
      expect(zlib.gunzipSync(read(PROD, p)!).toString()).toMatch(/^\{/)
    }
    // The held date keeps prod's copy.
    expect(
      zlib
        .gunzipSync(read(PROD, 'snapshots/2026-10-10/district_61.json')!)
        .toString()
    ).toBe('{"prod":"10-10"}')
    // Globals hold with it (they aggregate over the held date).
    expect(read(PROD, 'v1/dates.json')?.toString()).toBe(
      DATES_JSON(['2026-10-01', '2026-10-10'])
    )
    expect(read(PROD, 'time-series/district_61/2026-2027.json')).toBeNull()
    expect(read(PROD, 'config/district-snapshot-index.json')).toBeNull()

    // Everything else in prod is untouched; nothing unread or internal arrived.
    const after = tree(PROD)
    const changed = Object.keys(after).filter(k => after[k] !== before[k])
    expect(changed.sort()).toEqual([
      'snapshots/2026-10-11/analytics/district_61_analytics.json',
      'snapshots/2026-10-11/district_61.json',
    ])

    expect(r.outputs.objects_copied).toBe('2')
    expect(r.outputs.promoted_dates).toBe('2026-10-11')
    expect(r.outputs.held_dates).toBe('2026-10-10')
    expect(r.outputs.globals_promoted).toBe('false')
    expect(r.outputs.complete).toBe('false')
  })
})

describe('promote-run-manifest --execute: no hold', () => {
  it('copies both dates, time-series, v1/ and config/ — and nothing internal or unread', async () => {
    writeInputs({ promote: true })
    const before = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)

    const after = tree(PROD)
    const changed = Object.keys(after)
      .filter(k => after[k] !== before[k])
      .sort()
    expect(changed).toEqual([
      'config/district-snapshot-index.json',
      'snapshots/2026-10-10/district_61.json',
      'snapshots/2026-10-11/analytics/district_61_analytics.json',
      'snapshots/2026-10-11/district_61.json',
      'time-series/district_61/2026-2027.json',
      'v1/dates.json',
      'v1/latest.json',
      'v1/rank-history/61.json',
    ])
    // The prod twin: every promoted object equals the staging object.
    for (const p of changed) expect(after[p]).toBe(tree(STG)[p])
    expect(read(PROD, 'snapshots/2026-10-01/district_61.json')).not.toBeNull()
    expect(r.outputs.complete).toBe('true')
    expect(r.outputs.globals_promoted).toBe('true')
    expect(r.outputs.objects_copied).toBe('8')
  })

  it('writes the v1/ entry points in the last copy, after every date and global', async () => {
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    const copies = fs
      .readFileSync(shimLog, 'utf-8')
      .split('\n')
      .filter(l => l.startsWith('storage cp ') && l.includes(`gs://${PROD}/`))
    expect(copies.length).toBeGreaterThan(1)
    const last = copies[copies.length - 1]!
    expect(last).toContain(`gs://${STG}/v1/dates.json`)
    expect(last).toContain(`gs://${STG}/v1/latest.json`)
    expect(copies.slice(0, -1).join('\n')).not.toMatch(
      /v1\/(dates|latest)\.json/
    )
  })

  it('never rsyncs to prod and never deletes', async () => {
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    const log = fs.readFileSync(shimLog, 'utf-8')
    expect(log).not.toMatch(/^storage (rsync|rm|mv)\b/m)
  })

  it('converges on a re-run (idempotent)', async () => {
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    const once = tree(PROD)
    expect((await run(['--execute'])).status).toBe(0)
    expect(tree(PROD)).toEqual(once)
  })

  it('holds the globals when staging indexes a date prod lacks and this run does not promote', async () => {
    // An earlier, held run left 2026-09-30 in staging's index.
    put(
      STG,
      'v1/dates.json',
      DATES_JSON(['2026-09-30', '2026-10-01', '2026-10-10', '2026-10-11'])
    )
    writeInputs({ promote: true })
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'snapshots/2026-10-11/district_61.json')).not.toBeNull()
    expect(read(PROD, 'snapshots/2026-09-30/district_61.json')).toBeNull()
    expect(read(PROD, 'v1/dates.json')?.toString()).toBe(
      DATES_JSON(['2026-10-01', '2026-10-10'])
    )
    expect(r.outputs.globals_promoted).toBe('false')
    expect(r.stderr).toContain('2026-09-30')
    // The promotion-held alert names it (#1763 PR 2): one line, no newline.
    expect(r.outputs.globals_reason).toContain('2026-09-30')
    expect(r.outputs.globals_reason).toContain('re-derive')
  })
})

describe('promote-run-manifest failure modes', () => {
  it('a failed copy stops before the entry points and exits non-zero', async () => {
    writeInputs({ promote: true })
    const r = await run(['--execute'], { SHIM_FAIL_MATCH: 'time-series' })
    expect(r.status).not.toBe(0)
    expect(read(PROD, 'v1/latest.json')?.toString()).toBe(
      LATEST_JSON('2026-10-10')
    )
    expect(r.outputs.complete).toBe('false')
  })

  it('copies nothing when the completeness verdict is missing', async () => {
    writeInputs(undefined)
    const before = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status).not.toBe(0)
    expect(tree(PROD)).toEqual(before)
  })

  it('refuses a malformed manifest and copies nothing', async () => {
    writeInputs({ promote: true })
    fs.appendFileSync(manifestFile, '{"path":\n')
    const before = tree(PROD)
    expect((await run(['--execute'])).status).not.toBe(0)
    expect(tree(PROD)).toEqual(before)
  })

  it('a gate that could not run holds everything but exits 0, so the promotion-held flow still runs', async () => {
    // The shape scripts/date-completeness-gate.ts writes on an error.
    writeInputs({
      promote: false,
      heldDates: [],
      failures: [{ path: '(gate)', reason: 'boom' }],
    })
    const before = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    expect(tree(PROD)).toEqual(before)
    expect(r.outputs.objects_copied).toBe('0')
    expect(r.outputs.complete).toBe('false')
  })
})

describe('promote-run-manifest --dry-run', () => {
  it('prints exactly what would be copied and writes nothing', async () => {
    writeInputs({ promote: false, heldDates: ['2026-10-10'] })
    const before = tree(PROD)
    const r = await run(['--dry-run'])
    expect(r.status, r.stderr).toBe(0)
    expect(tree(PROD)).toEqual(before)
    const log = fs.existsSync(shimLog) ? fs.readFileSync(shimLog, 'utf-8') : ''
    expect(log).not.toMatch(/^storage cp\b/m)

    const copies = r.stdout.split('\n').filter(l => l.startsWith('copy\t'))
    expect(copies).toEqual([
      `copy\tdates\tgs://${STG}/snapshots/2026-10-11/district_61.json\tgs://${PROD}/snapshots/2026-10-11/district_61.json`,
      `copy\tdates\tgs://${STG}/snapshots/2026-10-11/analytics/district_61_analytics.json\tgs://${PROD}/snapshots/2026-10-11/analytics/district_61_analytics.json`,
    ])
    expect(r.stdout).toMatch(
      /^hold\tsnapshots\/2026-10-10\/district_61\.json\t/m
    )
    expect(r.stdout).toMatch(/^hold\tv1\/latest\.json\t/m)
    expect(r.stdout).toMatch(
      /^skip\tclub-trends\/2026-2027\/district_61\.json\t/m
    )
    expect(r.outputs.objects_planned).toBe('2')
  })

  it('needs no completeness file to preview against a published manifest', async () => {
    writeInputs(undefined)
    const r = await run(['--dry-run', '--assume-pass'])
    expect(r.status, r.stderr).toBe(0)
    expect(
      r.stdout.split('\n').filter(l => l.startsWith('copy\t'))
    ).toHaveLength(8)
  })
})

describe('scripts/promote-run-manifest.ts (the CLI the workflow runs)', () => {
  it('wires argv, env, stdout and the exit code to the runner', () => {
    writeInputs({ promote: false, heldDates: ['2026-10-10'] })
    const before = tree(PROD)
    const dry = spawnSync(TSX, [CLI, '--dry-run'], {
      encoding: 'utf-8',
      env: runEnv(),
    })
    expect(dry.status, dry.stderr).toBe(0)
    expect(dry.stdout.split('\n').filter(l => l.startsWith('copy\t'))).toEqual([
      `copy\tdates\tgs://${STG}/snapshots/2026-10-11/district_61.json\tgs://${PROD}/snapshots/2026-10-11/district_61.json`,
      `copy\tdates\tgs://${STG}/snapshots/2026-10-11/analytics/district_61_analytics.json\tgs://${PROD}/snapshots/2026-10-11/analytics/district_61_analytics.json`,
    ])
    expect(tree(PROD)).toEqual(before)
  })
})

describe('promote-run-manifest usage', () => {
  it.each([
    [[]],
    [['--dry-run', '--execute']],
    [['--execute', '--assume-pass']],
  ])('refuses %j with exit 2', async args => {
    writeInputs({ promote: true })
    expect((await run(args)).status).toBe(2)
  })
})

describe('gcloud shim: bucket-to-bucket cp, cat, one-level ls (#1763 harness)', () => {
  const shim = (...args: string[]) =>
    spawnSync(SHIM, args, {
      encoding: 'utf-8',
      env: { ...process.env, SHIM_ROOT: root },
    })

  it('cp gs→gs is a server-side rewrite: bytes and metadata carried as stored', () => {
    const r = shim(
      'storage',
      'cp',
      `gs://${STG}/snapshots/2026-10-11/district_61.json`,
      `gs://${PROD}/snapshots/2026-10-11/`
    )
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'snapshots/2026-10-11/district_61.json')).toEqual(
      read(STG, 'snapshots/2026-10-11/district_61.json')
    )
    expect(meta(PROD, 'snapshots/2026-10-11/district_61.json')).toBe(
      meta(STG, 'snapshots/2026-10-11/district_61.json')
    )
  })

  it('cat prints an object', () => {
    const r = shim('storage', 'cat', `gs://${STG}/v1/latest.json`)
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout).latestSnapshotDate).toBe('2026-10-11')
  })

  it('ls of a prefix lists one level, directories with a trailing slash', () => {
    const r = shim('storage', 'ls', `gs://${PROD}/snapshots/`)
    expect(r.status).toBe(0)
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([
      `gs://${PROD}/snapshots/2026-10-01/`,
      `gs://${PROD}/snapshots/2026-10-10/`,
    ])
  })
})

/**
 * The prune reconcile through the promoter (#1767, ADR-015 step 9). Prod
 * still holds a pruned daily (2026-09-15) and the index that names it;
 * staging is already pruned and the run regenerated the indexes. The
 * promoter copies the indexes, then deletes the planned prefixes — and
 * deletes nothing unless the indexes promoted.
 */
describe('promote-run-manifest --execute: prune reconcile deletes (#1767)', () => {
  let deletesFile: string

  beforeEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.mkdirSync(path.join(root, STG), { recursive: true })
    fs.mkdirSync(path.join(root, PROD), { recursive: true })
    manifestLines.length = 0
    put(PROD, 'snapshots/2026-09-15/district_61.json', '{"daily":1}', true)
    put(PROD, 'snapshots/2026-09-15/analytics/d61.json', '{"a":1}', true)
    put(PROD, 'snapshots/2026-09-30/district_61.json', '{"me":1}', true)
    put(PROD, 'raw-csv/2026-09-15/all-districts.csv', 'a,b\n')
    put(PROD, 'v1/dates.json', DATES_JSON(['2026-09-15', '2026-09-30']))
    put(PROD, 'v1/latest.json', LATEST_JSON('2026-09-30'))
    put(PROD, 'config/district-snapshot-index.json', '{"old":1}')

    put(STG, 'snapshots/2026-09-30/district_61.json', '{"me":1}', true)
    stage('v1/dates.json', DATES_JSON(['2026-09-30']))
    stage('v1/latest.json', LATEST_JSON('2026-09-30'))
    stage('config/district-snapshot-index.json', '{"new":1}')

    deletesFile = path.join(tmp, 'prod-reconcile-paths.txt')
    fs.writeFileSync(deletesFile, 'raw-csv/2026-09-15\nsnapshots/2026-09-15\n')
    writeInputs({ promote: true })
  })

  const runPrune = (args: string[], env: Record<string, string> = {}) =>
    run(args, { PROD_DELETES_FILE: deletesFile, ...env })

  it('shrinks the index and deletes the pruned prefixes from prod', async () => {
    const r = await runPrune(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'v1/dates.json')?.toString()).toBe(
      DATES_JSON(['2026-09-30'])
    )
    expect(read(PROD, 'config/district-snapshot-index.json')?.toString()).toBe(
      '{"new":1}'
    )
    expect(Object.keys(tree(PROD)).sort()).toEqual([
      'config/district-snapshot-index.json',
      'snapshots/2026-09-30/district_61.json',
      'v1/dates.json',
      'v1/latest.json',
    ])
    expect(r.outputs.prefixes_deleted).toBe('2')
    expect(r.outputs.complete).toBe('true')
  })

  it('deletes only after the v1/ entry points are copied, and never rsyncs', async () => {
    expect((await runPrune(['--execute'])).status).toBe(0)
    const log = fs.readFileSync(shimLog, 'utf-8').split('\n')
    const lastCopy = log.map(l => l.startsWith('storage cp ')).lastIndexOf(true)
    const rms = log.filter(l => l.startsWith('storage rm '))
    expect(rms).toEqual([
      `storage rm -r gs://${PROD}/raw-csv/2026-09-15/`,
      `storage rm -r gs://${PROD}/snapshots/2026-09-15/`,
    ])
    expect(log.findIndex(l => l.startsWith('storage rm '))).toBeGreaterThan(
      lastCopy
    )
    expect(log[lastCopy]).toContain('v1/dates.json')
    expect(log.join('\n')).not.toMatch(/^storage rsync\b/m)
  })

  it('deletes nothing when the indexes hold, and fails so the run is red', async () => {
    // Staging's index names a date prod lacks: the globals hold.
    put(STG, 'v1/dates.json', DATES_JSON(['2026-09-20', '2026-09-30']))
    const before = tree(PROD)
    const r = await runPrune(['--execute'])
    expect(r.status).toBe(1)
    expect(tree(PROD)).toEqual(before)
    expect(r.stderr).toMatch(/::error title=Prune reconcile::/)
    expect(r.outputs.prefixes_deleted).toBe('0')
  })

  it('refuses an out-of-scope delete and touches nothing', async () => {
    fs.writeFileSync(deletesFile, 'v1/rank-history\n')
    const before = tree(PROD)
    const r = await runPrune(['--execute'])
    expect(r.status).toBe(2)
    expect(tree(PROD)).toEqual(before)
  })

  it('refuses a missing delete manifest and touches nothing', async () => {
    fs.rmSync(deletesFile)
    const before = tree(PROD)
    const r = await runPrune(['--execute'])
    expect(r.status).toBe(2)
    expect(tree(PROD)).toEqual(before)
  })

  it('an empty delete manifest just promotes the indexes', async () => {
    fs.writeFileSync(deletesFile, '')
    const r = await runPrune(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'snapshots/2026-09-15/district_61.json')).not.toBeNull()
    expect(r.outputs.prefixes_deleted).toBe('0')
  })

  it('a failed delete warns and goes on, as the old reconcile did; the next prune sweeps it', async () => {
    const r = await runPrune(['--execute'], {
      SHIM_FAIL_MATCH: '^rm -r .*raw-csv',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'raw-csv/2026-09-15/all-districts.csv')).not.toBeNull()
    expect(read(PROD, 'snapshots/2026-09-15/district_61.json')).toBeNull()
    expect(r.stderr).toMatch(
      /::warning title=Prune reconcile::.*raw-csv\/2026-09-15/
    )
    expect(r.outputs.prefixes_deleted).toBe('1')
    expect(r.outputs.complete).toBe('false')
  })

  it('the dry run lists the deletes and writes nothing', async () => {
    const before = tree(PROD)
    const r = await runPrune(['--dry-run'])
    expect(r.status, r.stderr).toBe(0)
    expect(tree(PROD)).toEqual(before)
    expect(r.stdout.split('\n').filter(l => l.startsWith('delete\t'))).toEqual([
      `delete\tgs://${PROD}/raw-csv/2026-09-15/`,
      `delete\tgs://${PROD}/snapshots/2026-09-15/`,
    ])
  })
})

describe('gcloud shim: rm -r of a prefix (#1767 harness)', () => {
  const shim = (...args: string[]) =>
    spawnSync(SHIM, args, {
      encoding: 'utf-8',
      env: { ...process.env, SHIM_ROOT: root },
    })

  it('removes every object under the prefix and its metadata', () => {
    const r = shim('storage', 'rm', '-r', `gs://${PROD}/snapshots/2026-10-01/`)
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'snapshots/2026-10-01/district_61.json')).toBeNull()
    expect(meta(PROD, 'snapshots/2026-10-01/district_61.json')).toBeNull()
    expect(read(PROD, 'snapshots/2026-10-10/district_61.json')).not.toBeNull()
  })

  it('fails on a prefix with no objects', () => {
    const r = shim('storage', 'rm', '-r', `gs://${PROD}/snapshots/2026-01-01/`)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('matched no objects')
  })
})

/**
 * #2232: prod still holds district U's 0-club junk from an earlier build
 * on 2026-10-10. Staging no longer has it (the rebuild's staging step, or
 * an earlier proof run, removed it) and staging's metadata.json records U
 * as a #1671 gap. Promotion of the date derives the prod removals from
 * that state, not from any record of the run, so every path converges.
 */
describe('promote-run-manifest --execute: a gap district converges in prod (#2232)', () => {
  const D = 'snapshots/2026-10-10'
  const JUNK = '{"districtId":"U","data":{"clubs":[]}}'
  const GAP_META = JSON.stringify({
    successfulDistricts: ['61'],
    failedDistricts: ['U'],
    errors: ['U: Skipped: club-performance.csv is not a CSV (#1671)'],
  })
  const STALE = [
    `${D}/analytics/district_U_analytics.json`,
    `${D}/analytics/district_U_membership.json`,
    `${D}/district_U.json`,
  ]

  beforeEach(() => {
    put(STG, `${D}/metadata.json`, GAP_META, true)
    put(PROD, `${D}/district_U.json`, JUNK, true)
    put(PROD, `${D}/analytics/district_U_analytics.json`, '{"m":0}', true)
    put(PROD, `${D}/analytics/district_U_membership.json`, '{"m":0}', true)
    // Kept: the reports sidecar (real TI data), a neighbour id, and U on
    // a date this run does not promote.
    put(PROD, `${D}/district_U_reports.json`, '{"reports":1}', true)
    put(STG, `${D}/district_U_reports.json`, '{"reports":1}', true)
    put(PROD, `${D}/district_UX.json`, '{"keep":1}', true)
    put(PROD, 'snapshots/2026-10-01/district_U.json', JUNK, true)
  })

  it("removes the gap district's transform objects from prod with no removals record at all", async () => {
    writeInputs({ promote: true })
    const before = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    const after = tree(PROD)
    expect(Object.keys(before).filter(k => !(k in after))).toEqual(STALE)
    for (const p of STALE) expect(meta(PROD, p)).toBeNull()
    expect(read(PROD, `${D}/district_U_reports.json`)).not.toBeNull()
    expect(read(PROD, `${D}/district_UX.json`)).not.toBeNull()
    expect(read(PROD, 'snapshots/2026-10-01/district_U.json')).not.toBeNull()
    expect(r.outputs.objects_removed).toBe('3')
    expect(r.outputs.complete).toBe('true')
  })

  it('removes after the v1/ entry points: analytics first, the district file last', async () => {
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    const log = fs.readFileSync(shimLog, 'utf-8').split('\n')
    const lastCopy = log.map(l => l.startsWith('storage cp ')).lastIndexOf(true)
    expect(log[lastCopy]).toContain('v1/dates.json')
    const rms = log.filter(l => l.startsWith('storage rm '))
    expect(rms).toEqual([
      `storage rm gs://${PROD}/${STALE[0]} gs://${PROD}/${STALE[1]}`,
      `storage rm gs://${PROD}/${STALE[2]}`,
    ])
    expect(log.findIndex(l => l.startsWith('storage rm '))).toBeGreaterThan(
      lastCopy
    )
  })

  it('a re-run converges and removes nothing more', async () => {
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    const once = tree(PROD)
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    expect(tree(PROD)).toEqual(once)
    expect(r.outputs.objects_removed).toBe('0')
  })

  it('a held date keeps its objects, and a later promote of it removes them', async () => {
    writeInputs({ promote: false, heldDates: ['2026-10-10'] })
    expect((await run(['--execute'])).status).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).not.toBeNull()
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).toBeNull()
  })

  it('a failed copy removes nothing, and the next promote converges', async () => {
    writeInputs({ promote: true })
    const r = await run(['--execute'], { SHIM_FAIL_MATCH: '^cp .*2026-10-11' })
    expect(r.status).toBe(1)
    for (const p of STALE) expect(read(PROD, p)).not.toBeNull()
    expect((await run(['--execute'])).status).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).toBeNull()
  })

  it('keeps prod whole while staging still holds the district file', async () => {
    put(STG, `${D}/district_U.json`, JUNK, true)
    writeInputs({ promote: true })
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).not.toBeNull()
  })

  it("never removes prod's real clubs, whatever a gate allowed", async () => {
    put(
      PROD,
      `${D}/district_U.json`,
      '{"districtId":"U","data":{"clubs":[{"id":1}]}}',
      true
    )
    writeInputs({ promote: true })
    const r = await run(['--execute'])
    expect(r.status, r.stderr).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).not.toBeNull()
    expect(r.stderr).toMatch(/::warning title=Gap removal::.*1 club/)
  })

  it('removes nothing for a failed district without the #1671 gap reason', async () => {
    put(
      STG,
      `${D}/metadata.json`,
      JSON.stringify({
        successfulDistricts: ['61'],
        failedDistricts: ['U'],
        errors: ['U: transform failed'],
      }),
      true
    )
    writeInputs({ promote: true })
    expect((await run(['--execute'])).status).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).not.toBeNull()
  })

  it('a failed removal fails the step; the next promote converges', async () => {
    writeInputs({ promote: true })
    const r = await run(['--execute'], { SHIM_FAIL_MATCH: '^rm ' })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/::error title=Gap removal::/)
    expect(r.outputs.complete).toBe('false')
    expect((await run(['--execute'])).status).toBe(0)
    for (const p of STALE) expect(read(PROD, p)).toBeNull()
  })

  it('the dry run lists the removals and writes nothing', async () => {
    writeInputs({ promote: true })
    const before = tree(PROD)
    const r = await run(['--dry-run'])
    expect(r.status, r.stderr).toBe(0)
    expect(tree(PROD)).toEqual(before)
    expect(r.stdout.split('\n').filter(l => l.startsWith('remove\t'))).toEqual(
      STALE.map(p => `remove\tgs://${PROD}/${p}`)
    )
    expect(r.outputs.removals_planned).toBe('3')
  })
})
describe('gcloud shim: rm of exact objects (#2232 harness)', () => {
  const shim = (...args: string[]) =>
    spawnSync(SHIM, args, {
      encoding: 'utf-8',
      env: { ...process.env, SHIM_ROOT: root },
    })

  it('removes each named object and its metadata, nothing else', () => {
    const r = shim(
      'storage',
      'rm',
      `gs://${PROD}/snapshots/2026-10-01/district_61.json`
    )
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, 'snapshots/2026-10-01/district_61.json')).toBeNull()
    expect(meta(PROD, 'snapshots/2026-10-01/district_61.json')).toBeNull()
    expect(read(PROD, 'snapshots/2026-10-10/district_61.json')).not.toBeNull()
  })

  it('fails on a URL that matches no object', () => {
    const r = shim('storage', 'rm', `gs://${PROD}/snapshots/none.json`)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('matched no objects')
  })
})

describe('promote-run-manifest: a prune reconcile whose gate could not run (#1767)', () => {
  it('deletes nothing and fails, since prune has no promotion-held flow', async () => {
    const deletesFile = path.join(tmp, 'prod-reconcile-paths.txt')
    fs.writeFileSync(deletesFile, 'snapshots/2026-10-01\n')
    writeInputs({ promote: false, heldDates: [] })
    const before = tree(PROD)
    const r = await run(['--execute'], { PROD_DELETES_FILE: deletesFile })
    expect(r.status).toBe(1)
    expect(tree(PROD)).toEqual(before)
    expect(r.outputs.prefixes_deleted).toBe('0')
  })
})
