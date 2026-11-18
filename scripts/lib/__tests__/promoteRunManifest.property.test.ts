/**
 * Property tests for the scoped promotion (#2930, follow-up to #2856 and
 * #2927), run in-process against the fake gcloud shim used by
 * promoteRunManifest.test.ts.
 *
 * - Idempotent: promoting twice over the same manifest leaves the same prod
 *   state and the same removal record as promoting once (a re-run converges).
 * - Every object the promote removes from prod is on the removal record, and
 *   the record the runner writes reads back through parseRemovalRecord
 *   unchanged (the write-then-read round trip for the record).
 *
 * The scenarios vary which dates are staged, which are held, whether a #2232
 * gap district sits in prod, and whether a prune reconcile deletes prefixes.
 * A fixed seed and a small run count keep it deterministic and fast: each run
 * spawns the bash shim several times.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { parseRemovalRecord } from '../dataRestorePlan.js'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'

const SHIM = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const GAP_DATE = '2026-10-10'
const GAP_DIR = `snapshots/${GAP_DATE}`
const FULL: Scenario = {
  staged: [GAP_DATE, '2026-10-11'],
  held: [],
  gap: true,
  prune: true,
}
const HELD: Scenario = { ...FULL, held: [GAP_DATE] }
// The two examples make sure removals really happen; the rest vary around them.
// The space is 32 scenarios, and sampling stays (#2934): running all 32 through
// the three properties took about 30 s here (each promote spawns the bash shim,
// about 0.3 s), against a 10 s budget for this suite.
const RUN = {
  seed: 2930,
  numRuns: 4,
  examples: [[FULL], [HELD]] as [Scenario][],
}

let tmp: string
let root: string

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

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

const DATES_JSON = (dates: string[]) =>
  JSON.stringify({ _format: { version: '1.0.0', type: 'dates-index' }, dates })
const LATEST_JSON = (d: string) =>
  JSON.stringify({
    _format: { version: '1.0.0', type: 'manifest' },
    latestSnapshotDate: d,
    generatedAt: '2026-10-12T09:06:52.939Z',
  })

interface Scenario {
  staged: string[]
  held: string[]
  gap: boolean
  prune: boolean
}

const STAGEABLE = [GAP_DATE, '2026-10-11']

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    staged: fc.subarray(STAGEABLE, { minLength: 1 }),
    heldMask: fc.array(fc.boolean(), { minLength: 2, maxLength: 2 }),
    gap: fc.boolean(),
    prune: fc.boolean(),
  })
  .map(s => ({
    staged: s.staged,
    held: s.staged.filter(d => s.heldMask[STAGEABLE.indexOf(d)]),
    gap: s.gap,
    prune: s.prune,
  }))

/** Build the two buckets, the manifest, the gate verdict and the delete list. */
function world(s: Scenario): {
  env: Record<string, string | undefined>
  record: string
} {
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(path.join(root, STG), { recursive: true })
  fs.mkdirSync(path.join(root, PROD), { recursive: true })
  const manifest: string[] = []
  const stage = (p: string, body: string, gz = false) => {
    const raw = put(STG, p, body, gz)
    const date = /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null
    manifest.push(
      JSON.stringify({ path: p, sha256: sha(raw), date, stage: 'test' })
    )
  }

  const prodDates = ['2026-10-01', ...(s.prune ? ['2026-09-15'] : [])].sort()
  put(PROD, 'snapshots/2026-10-01/district_61.json', '{"prod":"10-01"}', true)
  put(PROD, `${GAP_DIR}/district_61.json`, '{"prod":"10-10"}', true)
  put(PROD, 'v1/dates.json', DATES_JSON(prodDates))
  put(PROD, 'v1/latest.json', LATEST_JSON('2026-10-01'))
  if (s.prune) {
    put(PROD, 'snapshots/2026-09-15/district_61.json', '{"daily":1}', true)
    put(PROD, 'raw-csv/2026-09-15/all-districts.csv', 'a,b\n')
  }
  if (s.gap) {
    const junk = '{"districtId":"U","data":{"clubs":[]}}'
    put(PROD, `${GAP_DIR}/district_U.json`, junk, true)
    put(PROD, `${GAP_DIR}/analytics/district_U_analytics.json`, '{"m":0}', true)
  }

  for (const d of s.staged) {
    stage(`snapshots/${d}/district_61.json`, `{"stg":"${d}"}`, true)
  }
  if (s.gap && s.staged.includes(GAP_DATE)) {
    put(
      STG,
      `${GAP_DIR}/metadata.json`,
      JSON.stringify({
        successfulDistricts: ['61'],
        failedDistricts: ['U'],
        errors: ['U: Skipped: club-performance.csv is not a CSV (#1671)'],
      }),
      true
    )
  }
  const indexed = [
    ...new Set([
      ...prodDates.filter(d => !s.prune || d !== '2026-09-15'),
      ...s.staged,
    ]),
  ].sort()
  stage('v1/dates.json', DATES_JSON(indexed))
  stage('v1/latest.json', LATEST_JSON(indexed[indexed.length - 1] as string))
  stage('config/district-snapshot-index.json', '{"idx":1}')

  const manifestFile = path.join(tmp, 'written.jsonl')
  fs.writeFileSync(manifestFile, manifest.join('\n') + '\n')
  const gateFile = path.join(tmp, 'completeness-gate.json')
  fs.writeFileSync(
    gateFile,
    JSON.stringify(
      s.held.length > 0
        ? { promote: false, heldDates: s.held }
        : { promote: true }
    )
  )
  const env: Record<string, string | undefined> = {
    ...process.env,
    GCLOUD: SHIM,
    SHIM_ROOT: root,
    SHIM_LOG: path.join(tmp, 'shim.log'),
    GCS_BUCKET: STG,
    GCS_BUCKET_PRODUCTION: PROD,
    RUN_MANIFEST_FILE: manifestFile,
    COMPLETENESS_GATE_FILE: gateFile,
  }
  if (s.prune) {
    const deletesFile = path.join(tmp, 'prod-reconcile-paths.txt')
    fs.writeFileSync(deletesFile, 'raw-csv/2026-09-15\nsnapshots/2026-09-15\n')
    env.PROD_DELETES_FILE = deletesFile
  }
  const record = path.join(tmp, 'prod-removed.jsonl')
  env.PROD_REMOVALS_FILE = record
  return { env, record }
}

async function promote(env: Record<string, string | undefined>) {
  let stderr = ''
  const status = await runPromoteRunManifest(['--execute'], {
    env,
    out: () => undefined,
    err: s => (stderr += s),
  })
  return { status, stderr }
}

/** The record as a set of `kind path` lines: re-recording a path adds nothing. */
function recordSet(file: string): string[] {
  if (!fs.existsSync(file)) return []
  return [
    ...new Set(
      parseRemovalRecord(fs.readFileSync(file, 'utf-8')).map(
        r => `${r.kind} ${r.path}`
      )
    ),
  ].sort()
}

/** The record's lines in the order the runner appended them. */
function recordLines(file: string): { path: string; kind: string }[] {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as { path: string; kind: string })
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-property-'))
  root = path.join(tmp, 'gcs')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('promote-run-manifest properties (#2930)', () => {
  it('the full scenario removes prune prefixes and gap objects, so the properties are not vacuous', async () => {
    const { env, record } = world(FULL)
    const before = tree(PROD)
    expect((await promote(env)).status).toBe(0)
    const after = tree(PROD)
    const removed = Object.keys(before).filter(k => !(k in after))
    expect(removed).toHaveLength(4)
    expect(recordSet(record)).toEqual([
      `gap ${GAP_DIR}/analytics/district_U_analytics.json`,
      `gap ${GAP_DIR}/district_U.json`,
      'prune raw-csv/2026-09-15/',
      'prune snapshots/2026-09-15/',
    ])
  })

  it('promoting twice equals promoting once: same prod state, same removal record', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async s => {
        const { env, record } = world(s)
        const first = await promote(env)
        expect(first.status, first.stderr).toBeLessThan(2)
        const prodOnce = tree(PROD)
        const recordOnce = recordSet(record)
        const linesOnce = recordLines(record)

        const second = await promote(env)
        expect(second.status, second.stderr).toBeLessThan(2)
        expect(tree(PROD)).toEqual(prodOnce)
        expect(recordSet(record)).toEqual(recordOnce)
        // A re-run may append lines (the runner appends, the planner dedupes
        // by path), but only prune prefixes: a gap object is gone after the
        // first run, so there is nothing left to record for it (#2934).
        for (const added of recordLines(record).slice(linesOnce.length)) {
          expect(added.kind, `re-run recorded ${added.path}`).toBe('prune')
          expect(added.path.endsWith('/'), added.path).toBe(true)
        }
      }),
      RUN
    )
  })

  it('every object a promote removes from prod is on the record, and the record reads back', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async s => {
        const { env, record } = world(s)
        const before = tree(PROD)
        const r = await promote(env)
        expect(r.status, r.stderr).toBeLessThan(2)
        const after = tree(PROD)

        const records = fs.existsSync(record)
          ? parseRemovalRecord(fs.readFileSync(record, 'utf-8'))
          : []
        const removed = Object.keys(before).filter(k => !(k in after))
        for (const name of removed) {
          const covered = records.some(x =>
            x.path.endsWith('/') ? name.startsWith(x.path) : name === x.path
          )
          expect(covered, `${name} removed but not recorded`).toBe(true)
        }
        // Write then read: every line the runner wrote is a record the plan
        // reader accepts, with the same path and kind.
        expect(records).toEqual(
          recordLines(record).map(l => ({ path: l.path, kind: l.kind }))
        )
      }),
      RUN
    )
  })
})
