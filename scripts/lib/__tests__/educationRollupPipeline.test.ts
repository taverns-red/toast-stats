/**
 * The education rollup in the pipeline (#1801, epic #1781; ADR-015 parity).
 *
 * scripts/pipeline/build-education-rollup.sh reads the persisted ledger
 * inputs from STAGING — raw-education-ledger/ (#1802), each reports PY's
 * newest snapshots/<date>/district_*_reports.json, each PY's last
 * all-districts-rankings.json and config/district-region-history.json —
 * folds them (scripts/lib/educationRollup.ts) and uploads
 * derived/education-rollup/{<PY>,index}.json to staging, recorded in the run
 * manifest. derived/ is not a promoted prefix: nothing reaches prod until
 * scoped promotion (#1763) lists it. The contracts here:
 *   1. run for real against the gcloud shim (D10) on recorded fixtures, it
 *      writes schema-valid per-PY objects and the index, plain JSON, under
 *      derived/education-rollup/ only, index last, every object recorded;
 *   2. a PY with no reports at any of its recent dates is omitted and named,
 *      never written as zeros; a missing input degrades, a listing error
 *      fails closed with nothing uploaded;
 *   3. no prod write (the #1755 guard);
 *   4. process-dates.sh runs it once after its loop, non-fatally, and daily
 *      runs the same script in its own job after place-reports (#2028).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { parse } from 'yaml'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
} from '@taverns-red/shared-contracts'
import { prodWriteReasons, type Workflow } from '../prodWriteGuard.js'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/build-education-rollup.sh')
const PROCESS_DATES = path.join(REPO, 'scripts/pipeline/process-dates.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const FIX = path.join(REPO, 'scripts/lib/__tests__/fixtures/education-rollup')
const BUCKET = 'test-bucket'
const PREFIX = 'derived/education-rollup/'

let tmp: string
let root: string
let shimLog: string
let stubLog: string
let summary: string
let manifest: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'education-rollup-'))
  root = path.join(tmp, 'gcs')
  shimLog = path.join(tmp, 'gcloud.log')
  stubLog = path.join(tmp, 'stubs.log')
  summary = path.join(tmp, 'summary.md')
  manifest = path.join(tmp, 'written.jsonl')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function shimEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GCLOUD: SHIM,
    SHIM_ROOT: root,
    SHIM_LOG: shimLog,
    SHIM_DOWNLOAD_DECOMPRESS: '1',
    CACHE_DIR: path.join(tmp, 'cache'),
    GITHUB_STEP_SUMMARY: summary,
    RUN_MANIFEST_FILE: manifest,
    ...extra,
  }
}

function runScript(extra: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, BUCKET], {
    cwd: REPO,
    encoding: 'utf-8',
    env: shimEnv(extra),
  })
}

/** Stage one fixture object; `gzip` = as the pipeline stages it (-Z). */
function put(objectPath: string, from: string, gzip: boolean): void {
  const dest = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const bytes = fs.readFileSync(path.join(FIX, from))
  fs.writeFileSync(dest, gzip ? zlib.gzipSync(bytes) : bytes)
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `${gzip ? 'content-encoding=gzip\n' : ''}content-type=application/json\n`
  )
}

/** Every recorded fixture at its staging path, encoded as staging has it. */
function seedAll(): void {
  for (const rel of fs
    .readdirSync(FIX, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(FIX, path.join(e.parentPath, e.name)))) {
    // Snapshots are uploaded -Z; the ledger and config/ are plain JSON.
    put(rel, rel, rel.startsWith('snapshots/'))
  }
  // 2020-21: a PY with a snapshot (rankings) but no reports at any date.
  put(
    'snapshots/2021-06-30/all-districts-rankings.json',
    'snapshots/2020-06-30/all-districts-rankings.json',
    true
  )
}

function allObjects(): string[] {
  const dir = path.join(root, BUCKET)
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort()
}
const rollupObjects = () => allObjects().filter(o => o.startsWith(PREFIX))

function readObject(objectPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(root, BUCKET, objectPath), 'utf-8')
  )
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

describe('build-education-rollup.sh: staging derived/education-rollup/', () => {
  it('uploads one schema-valid object per PY and the index', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(rollupObjects()).toEqual(
      ['2003-2004', '2018-2019', '2019-2020', '2026-2027', 'index']
        .map(k => `${PREFIX}${k}.json`)
        .sort()
    )
    const y2018 = EducationRollupProgramYearSchema.parse(
      readObject(`${PREFIX}2018-2019.json`)
    )
    expect(y2018.source).toBe('ledger-history')
    expect(y2018.world.totals.awards).toBe(201)
    // 85 is in the 2019-06-30 rankings but has no 2018-19 ledger file.
    expect(y2018.districts['85']).toMatchObject({ reason: 'no-file' })
    expect(y2018.regions?.['08']?.districtsAvailable).toEqual(['111'])

    const y2026 = EducationRollupProgramYearSchema.parse(
      readObject(`${PREFIX}2026-2027.json`)
    )
    expect(y2026).toMatchObject({ source: 'reports', sourceDate: '2026-10-12' })
    const d49 = y2026.districts['49']
    expect(d49?.status === 'available' && d49.awards.membersWithAward).toBe(65)
    expect(y2026.districts['61']).toMatchObject({ reason: 'no-file' })
  })

  it('names a PY with no reports at any date as omitted, never zeros', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const index = EducationRollupIndexSchema.parse(
      readObject(`${PREFIX}index.json`)
    )
    expect(index.programYears.map(p => p.programYear)).toEqual([
      '2003-2004',
      '2018-2019',
      '2019-2020',
      '2026-2027',
    ])
    expect(index.omittedProgramYears.map(o => o.programYear)).toEqual([
      '2020-2021',
    ])
    expect(index.asOf).toBe('2026-10-12')
    expect(rollupObjects()).not.toContain(`${PREFIX}2020-2021.json`)
  })

  it('uploads plain JSON (internal, no -Z), the index after every PY object', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    for (const obj of rollupObjects()) {
      const meta = fs.readFileSync(
        path.join(root, '.meta', BUCKET, obj),
        'utf-8'
      )
      expect(meta, obj).not.toContain('content-encoding=gzip')
      expect(meta, obj).toContain('content-type=application/json')
    }
    const uploads = lines(shimLog).filter(l =>
      /^storage cp .*gs:\/\/\S+\/derived\/education-rollup\/$/.test(l)
    )
    expect(uploads.at(-1)).toMatch(/index\.json gs:/)
    expect(uploads.slice(0, -1).join('\n')).not.toContain('index.json')
  })

  it('records every object in the run manifest with the sha256 of its bytes', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const recorded = lines(manifest).map(
      l => JSON.parse(l) as { path: string; sha256: string; stage: string }
    )
    expect(recorded.map(e => e.path).sort()).toEqual(rollupObjects())
    for (const e of recorded) {
      expect(e.stage).toBe('education-rollup')
      const bytes = fs.readFileSync(path.join(root, BUCKET, e.path))
      expect(e.sha256, e.path).toBe(
        createHash('sha256').update(bytes).digest('hex')
      )
    }
  })

  it('writes nothing outside derived/education-rollup/', () => {
    seedAll()
    const before = allObjects().filter(o => !o.startsWith(PREFIX))
    expect(runScript().status).toBe(0)
    expect(allObjects().filter(o => !o.startsWith(PREFIX))).toEqual(before)
  })

  it('reads each reports PY at its newest date only, and only one rankings file per PY', () => {
    seedAll()
    // An older 2026-27 date with reports: listed, never downloaded.
    put(
      'snapshots/2026-10-11/district_49_reports.json',
      'snapshots/2026-10-12/district_49_reports.json',
      true
    )
    put(
      'snapshots/2026-10-11/all-districts-rankings.json',
      'snapshots/2026-10-12/all-districts-rankings.json',
      true
    )
    expect(runScript().status).toBe(0)
    const reads = lines(shimLog)
      .filter(l => /^storage cp gs:\/\/\S+\/snapshots\//.test(l))
      .map(l => /snapshots\/([\d-]+)\/(\S+)/.exec(l)?.slice(1, 3).join('/'))
    expect(reads).not.toContain('2026-10-11/district_*_reports.json')
    expect(reads).not.toContain('2026-10-11/all-districts-rankings.json')
    expect(reads).toContain('2026-10-12/district_*_reports.json')
  })

  it('prints one JSON summary line on stdout (R4)', () => {
    seedAll()
    const r = runScript()
    const out = r.stdout.trim().split('\n')
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0]!)).toMatchObject({
      programYears: 4,
      omitted: 1,
    })
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(/education rollup/i)
  })

  it('reads gzip-stored reports under gcloud 568 too (bytes as stored)', () => {
    seedAll()
    const r = runScript({ SHIM_DOWNLOAD_DECOMPRESS: '0' })
    expect(r.status, r.stderr).toBe(0)
    expect(rollupObjects()).toContain(`${PREFIX}2026-2027.json`)
  })

  it('without a ledger history, the ledger years are omitted and the rest still build', () => {
    seedAll()
    fs.rmSync(path.join(root, BUCKET, 'raw-education-ledger'), {
      recursive: true,
    })
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::warning::.*raw-education-ledger/)
    expect(rollupObjects()).toContain(`${PREFIX}2026-2027.json`)
    expect(rollupObjects()).not.toContain(`${PREFIX}2003-2004.json`)
  })

  it('without a region history, every region block is null; districts and world still build', () => {
    seedAll()
    fs.rmSync(path.join(root, BUCKET, 'config/district-region-history.json'))
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::warning::.*district-region-history/)
    const y = EducationRollupProgramYearSchema.parse(
      readObject(`${PREFIX}2026-2027.json`)
    )
    expect(y.regions).toBeNull()
    expect(y.world.totals.awards).toBe(86)
  })

  it('a listing error fails closed (exit 1) with nothing uploaded', () => {
    seedAll()
    const r = runScript({ SHIM_FAIL_MATCH: '^ls .*snapshots' })
    expect(r.status).toBe(1)
    expect(rollupObjects()).toEqual([])
  })

  it('usage: exactly one bucket argument (exit 2)', () => {
    const r = spawnSync('bash', [SCRIPT], { cwd: REPO, encoding: 'utf-8' })
    expect(r.status).toBe(2)
  })
})

// #2102: the ledger history (~1,480 objects, ~180 MB) is the same every
// run, and it was downloaded whole by every daily and every rebuild. The
// workflow now restores it from the Actions cache into EDUCATION_LEDGER_DIR;
// the script treats that directory as a seed only, so the bucket stays the
// source of truth.
describe('build-education-rollup.sh: a seeded ledger (EDUCATION_LEDGER_DIR, #2102)', () => {
  const LEDGER = 'raw-education-ledger/'
  let seed: string
  let dl: string
  beforeEach(() => {
    seed = path.join(tmp, 'seed')
    dl = path.join(tmp, 'downloads.log')
  })
  const ledgerDownloads = () =>
    lines(dl)
      .filter(l => l.startsWith(LEDGER))
      .sort()
  const outputs = () =>
    Object.fromEntries(
      rollupObjects().map(o => [
        o,
        fs.readFileSync(path.join(root, BUCKET, o), 'utf-8'),
      ])
    )
  const seedFile = (rel: string) => path.join(seed, rel)

  it('an empty seed directory downloads the whole ledger, as before', () => {
    seedAll()
    const r = runScript({ EDUCATION_LEDGER_DIR: seed, SHIM_DOWNLOAD_LOG: dl })
    expect(r.status, r.stderr).toBe(0)
    expect(ledgerDownloads()).toEqual([
      `${LEDGER}2003-2004/district_17.json`,
      `${LEDGER}2003-2004/district_85.json`,
      `${LEDGER}2018-2019/district_111.json`,
    ])
  })

  it('a seed that matches the bucket is reused: nothing is downloaded again, same rollup', () => {
    seedAll()
    expect(runScript({ EDUCATION_LEDGER_DIR: seed }).status).toBe(0)
    const before = outputs()
    const r = runScript({ EDUCATION_LEDGER_DIR: seed, SHIM_DOWNLOAD_LOG: dl })
    expect(r.status, r.stderr).toBe(0)
    expect(ledgerDownloads()).toEqual([])
    expect(outputs()).toEqual(before)
  })

  it('a seed file that differs from its object is downloaded again', () => {
    seedAll()
    expect(runScript({ EDUCATION_LEDGER_DIR: seed }).status).toBe(0)
    const before = outputs()
    fs.writeFileSync(seedFile('2018-2019/district_111.json'), '{}')
    const r = runScript({ EDUCATION_LEDGER_DIR: seed, SHIM_DOWNLOAD_LOG: dl })
    expect(r.status, r.stderr).toBe(0)
    expect(ledgerDownloads()).toEqual([`${LEDGER}2018-2019/district_111.json`])
    expect(outputs()).toEqual(before)
  })

  it('a seed file the bucket does not hold is removed before the build', () => {
    seedAll()
    expect(runScript({ EDUCATION_LEDGER_DIR: seed }).status).toBe(0)
    const before = outputs()
    // 85 has no 2018-19 ledger object; a stale seed file must not add it.
    fs.copyFileSync(
      seedFile('2018-2019/district_111.json'),
      seedFile('2018-2019/district_85.json')
    )
    const r = runScript({ EDUCATION_LEDGER_DIR: seed })
    expect(r.status, r.stderr).toBe(0)
    expect(fs.existsSync(seedFile('2018-2019/district_85.json'))).toBe(false)
    expect(outputs()).toEqual(before)
  })

  it('with no ledger in the bucket, a seed is not used', () => {
    seedAll()
    expect(runScript({ EDUCATION_LEDGER_DIR: seed }).status).toBe(0)
    fs.rmSync(path.join(root, BUCKET, 'raw-education-ledger'), {
      recursive: true,
    })
    // The first run's objects stay in derived/; judge the second alone.
    fs.rmSync(path.join(root, BUCKET, PREFIX), { recursive: true })
    const r = runScript({ EDUCATION_LEDGER_DIR: seed })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::warning::.*raw-education-ledger/)
    expect(rollupObjects()).not.toContain(`${PREFIX}2003-2004.json`)
  })

  it('a ledger listing error fails closed with nothing uploaded', () => {
    seedAll()
    expect(runScript({ EDUCATION_LEDGER_DIR: seed }).status).toBe(0)
    fs.rmSync(path.join(root, BUCKET, PREFIX), { recursive: true })
    const r = runScript({
      EDUCATION_LEDGER_DIR: seed,
      SHIM_FAIL_MATCH: '^ls .*raw-education-ledger',
    })
    expect(r.status).toBe(1)
    expect(rollupObjects()).toEqual([])
  })
})

describe("the build writes staging only; prod is the mirror script's (#1810)", () => {
  it('is not under any promoted prefix', () => {
    expect(PROMOTED_PREFIXES.some(p => PREFIX.startsWith(p))).toBe(false)
  })

  it('the script makes no prod write (the #1755 prod-write guard)', () => {
    const text = fs.readFileSync(SCRIPT, 'utf-8')
    expect(prodWriteReasons(text)).toEqual([])
    expect(text).not.toMatch(/GCS_BUCKET_PRODUCTION|toast-stats-data-ca/)
  })
})

describe('process-dates.sh builds the rollup in every mode (ADR-015 P1)', () => {
  function runProcessDates(mode: string, env: Record<string, string> = {}) {
    return spawnSync('bash', [PROCESS_DATES, BUCKET, mode], {
      cwd: REPO,
      encoding: 'utf-8',
      env: shimEnv({
        COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
        GUARD_SNAPSHOT_UPLOAD: path.join(STUBS, 'guard-snapshot-upload'),
        RESOLVE_REBUILD_SOURCE: path.join(STUBS, 'resolve-rebuild-source'),
        VALIDATE_SNAPSHOTS: path.join(STUBS, 'validate-snapshots'),
        BUILD_IDENTITY_HISTORY: path.join(STUBS, 'build-identity-history'),
        BUILD_EDUCATION_ROLLUP: path.join(STUBS, 'build-education-rollup'),
        STUB_LOG: stubLog,
        DISTRICTS: '61',
        ...env,
      }),
    })
  }

  for (const mode of ['rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: invokes it exactly once, with the bucket, after identity`, () => {
      const r = runProcessDates(mode)
      expect(r.status, r.stderr).toBe(0)
      const stubs = lines(stubLog)
      expect(stubs.filter(l => l.startsWith('education-rollup '))).toEqual([
        `education-rollup ${BUCKET}`,
      ])
      expect(stubs.indexOf(`education-rollup ${BUCKET}`)).toBeGreaterThan(
        stubs.indexOf(`identity ${BUCKET}`)
      )
    })
  }

  it('a failed build is reported but does not fail the run or its counts', () => {
    const r = runProcessDates('rebuild', { STUB_EDUCATION_ROLLUP_FAIL: '1' })
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      succeeded: 0,
      refused: 0,
      failed: 0,
    })
    expect(r.stderr).toMatch(/::warning::.*education rollup/i)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /education rollup.*FAILED/i
    )
  })
})

describe('daily builds the rollup with the same script, after the reports land (#2028)', () => {
  // The rollup reads the newest snapshot date that has
  // district_*_reports.json. Those are written by `place-reports`, which
  // waits for the ~22-minute `daily-reports` fetch; the `pipeline` job's
  // upload step finishes long before. Run there, the rollup read the day
  // before's reports (run 38539146918: the rollup read 2026-10-12 at 09:08Z,
  // and the 2026-10-13 reports were placed at 09:22Z). So daily builds it in
  // its own job, ordered after `place-reports`.
  interface JobStep {
    name?: string
    id?: string
    if?: string
    run?: string
    uses?: string
    with?: Record<string, string>
  }
  interface Job {
    needs?: string | string[]
    if?: string
    steps?: JobStep[]
  }
  const wf = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as { jobs: Record<string, Job> }
  const CALL = 'bash scripts/pipeline/build-education-rollup.sh "${GCS_BUCKET}"'
  const MANIFEST = '"gs://${GCS_BUCKET}/runs/${GITHUB_RUN_ID}/written.jsonl"'
  const LOCAL = '"${RUN_MANIFEST_FILE}"'
  const job = wf.jobs['education-rollup']
  const steps = job?.steps ?? []
  const needs = ([] as string[]).concat(job?.needs ?? [])
  const flat = (s: JobStep) => (s.run ?? '').replace(/\\\r?\n\s*/g, ' ')
  const at = (pred: (s: JobStep) => boolean) => steps.findIndex(pred)
  const rollup = at(s => (s.run ?? '').includes(CALL))

  it('the pipeline job no longer builds it before the reports are placed', () => {
    const calls = (wf.jobs.pipeline?.steps ?? []).filter(s =>
      (s.run ?? '').includes('build-education-rollup.sh')
    )
    expect(calls.map(s => s.name)).toEqual([])
  })

  it('its own job runs after place-reports, whatever the reports outcome', () => {
    expect(job, 'no education-rollup job').toBeDefined()
    expect(needs).toEqual(expect.arrayContaining(['pipeline', 'place-reports']))
    // always(): a skipped or failed placement must not skip the rollup; the
    // newest reports already in staging are still a valid input.
    expect(job?.if).toMatch(/always\(\)/)
    expect(job?.if).toContain("needs.pipeline.result == 'success'")
    expect(job?.if).toContain("needs.pipeline.outputs.snapshot_date != ''")
  })

  it('calls the same script non-fatally', () => {
    expect(rollup, 'job does not call the script').toBeGreaterThanOrEqual(0)
    const run = steps[rollup]?.run ?? ''
    expect(run.slice(run.indexOf(CALL))).toMatch(/\|\|\s*echo "::warning::/)
  })

  it('installs deps, builds shared-contracts and pins gcloud 588 first', () => {
    const before = steps.slice(0, Math.max(rollup, 0))
    expect(before.some(s => s.uses?.startsWith('actions/checkout@'))).toBe(true)
    expect(before.some(s => (s.run ?? '').includes('npm ci'))).toBe(true)
    expect(
      before.some(s =>
        (s.run ?? '').includes(
          'npm run build --workspace=@taverns-red/shared-contracts'
        )
      )
    ).toBe(true)
    expect(
      before.find(s =>
        s.uses?.startsWith('google-github-actions/setup-gcloud@')
      )?.with?.version
    ).toBe('588.0.0')
  })

  it('appends to the run manifest the pipeline job published, then republishes it', () => {
    const seed = at(s => flat(s).includes(`${MANIFEST} ${LOCAL}`))
    const publish = at(s => flat(s).includes(`${LOCAL} ${MANIFEST}`))
    expect(seed, 'no manifest seed step').toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(rollup)
    expect(publish).toBeGreaterThan(rollup)
    expect(steps[publish]?.if).toContain('!cancelled()')
  })
})

describe('sample output for consumers (#1793, #1807, #1810, #1811)', () => {
  // fixtures/education-rollup-output/ is what this script builds from the
  // recorded inputs: consumers build against it until #1763 promotes the
  // real artifact. Regenerate with UPDATE_EDUCATION_ROLLUP_SAMPLE=1.
  const SAMPLE = path.join(
    REPO,
    'scripts/lib/__tests__/fixtures/education-rollup-output'
  )
  it('the built objects equal the committed sample', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    for (const obj of rollupObjects()) {
      const built = readObject(obj)
      const file = path.join(SAMPLE, path.basename(obj))
      if (process.env['UPDATE_EDUCATION_ROLLUP_SAMPLE'] === '1') {
        fs.mkdirSync(SAMPLE, { recursive: true })
        fs.writeFileSync(file, `${JSON.stringify(built, null, 2)}\n`)
      }
      expect(built, obj).toEqual(JSON.parse(fs.readFileSync(file, 'utf-8')))
    }
  })
})

// #2102: every job that builds the rollup restores the ledger seed from the
// Actions cache first. The key fingerprints the ledger listing, so a new
// cache entry is saved only when the ledger changes; the script verifies
// every seeded file either way, so a stale or partial seed costs bytes,
// never correctness.
describe('the ledger seed is restored before every rollup build (#2102)', () => {
  interface Step {
    name?: string
    id?: string
    if?: string
    run?: string
    uses?: string
    with?: Record<string, string>
  }
  const wf = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as {
    env?: Record<string, string>
    jobs: Record<string, { steps?: Step[] }>
  }
  const DIR = '${{ env.EDUCATION_LEDGER_DIR }}'
  const LISTING = '"gs://${GCS_BUCKET}/raw-education-ledger/**"'

  it('the seed directory is one workflow-level path', () => {
    expect(wf.env?.EDUCATION_LEDGER_DIR).toBe('/tmp/education-ledger')
  })

  const cases: Array<[string, RegExp]> = [
    ['education-rollup', /scripts\/pipeline\/build-education-rollup\.sh\b/],
    ['pipeline', /scripts\/pipeline\/process-dates\.sh\b/],
  ]
  for (const [jobName, builder] of cases) {
    const steps = wf.jobs[jobName]?.steps ?? []
    const first = steps.findIndex(s => builder.test(s.run ?? ''))
    const cache = steps.findIndex(s => s.uses?.startsWith('actions/cache@'))
    const key = steps.findIndex(s => (s.run ?? '').includes(LISTING))

    it(`${jobName}: fingerprints the ledger, then restores the seed, before the first build`, () => {
      expect(first, `${jobName} never builds the rollup`).toBeGreaterThan(0)
      expect(key, 'no ledger fingerprint step').toBeGreaterThanOrEqual(0)
      expect(cache, 'no cache step').toBeGreaterThan(key)
      expect(cache).toBeLessThan(first)
    })

    it(`${jobName}: the cache holds the seed directory under the fingerprint key`, () => {
      const c = steps[cache]
      const id = steps[key]?.id
      expect(id).toBeTruthy()
      expect(c?.with?.path).toBe(DIR)
      expect(c?.with?.key).toBe(`\${{ steps.${id}.outputs.key }}`)
      expect(c?.with?.['restore-keys']).toBe('education-ledger-v1-')
      expect(steps[key]?.run).toMatch(/education-ledger-v1-/)
    })

    it(`${jobName}: the seed steps run exactly when the build can`, () => {
      expect(steps[key]?.if).toBe(steps[cache]?.if)
      if (jobName === 'pipeline') {
        for (const mode of ['rebuild', 'rescrape', 'rescrape-historical']) {
          expect(steps[cache]?.if).toContain(
            `steps.mode.outputs.mode == '${mode}'`
          )
        }
      } else {
        expect(steps[cache]?.if).toBeUndefined()
      }
    })
  }
})
