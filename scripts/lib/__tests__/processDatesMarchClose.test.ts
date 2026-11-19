/**
 * scripts/pipeline/process-dates.sh — the March-close baseline pull (#1614).
 *
 * The President's Membership Retention Award divides April renewals by a base
 * that includes the March-close new and charter payments. The transform
 * (#3065) reads them from `$CACHE_DIR/baselines/march-close/{Y}-03-31.json`
 * for a logical date in April to June. This loop puts the file there.
 *
 * The pull has to be reliable, not best effort: a baseline present on one
 * run and absent on the next is an absent → present change in
 * SnapshotValueDiff that holds the daily for review. So a transient failure
 * is retried, a missing object is logged and the date goes on (the award
 * shows baseline-missing), and an object that exists but will not copy
 * fails the step rather than publish rankings without the fields.
 *
 * Runs the REAL script against the gcloud shim and the process-dates stubs,
 * as processDates.test.ts does.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/process-dates.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const BUCKET = 'test-bucket'
const BASELINE_OBJECT = 'snapshots/2026-03-31/all-districts-rankings.json'
const BASELINE_LOCAL = 'baselines/march-close/2026-03-31.json'
const BASELINE_BODY = JSON.stringify({
  metadata: { snapshotId: '2026-03-31' },
  rankings: [{ districtId: '61', newPayments: 400, charterPayments: 20 }],
})
const FAIL_BASELINE = '^cp gs://test-bucket/snapshots/2026-03-31/all-districts'

let tmp: string
let root: string
let cache: string
let shimLog: string
let stubLog: string
let diskLog: string
let summary: string

interface Result {
  status: number | null
  stdout: string
  stderr: string
  counts?: { succeeded: number; refused: number; failed: number }
}

function run(
  mode: string,
  dates: string[],
  env: Record<string, string> = {}
): Result {
  const r = spawnSync('bash', [SCRIPT, BUCKET, mode, ...dates], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      RAW_SOURCE_BUCKET: BUCKET,
      SHIM_LOG: shimLog,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      CACHE_DIR: cache,
      GITHUB_STEP_SUMMARY: summary,
      COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
      GUARD_SNAPSHOT_UPLOAD: path.join(STUBS, 'guard-snapshot-upload'),
      RESOLVE_REBUILD_SOURCE: path.join(STUBS, 'resolve-rebuild-source'),
      VALIDATE_SNAPSHOTS: path.join(STUBS, 'validate-snapshots'),
      BUILD_IDENTITY_HISTORY: path.join(STUBS, 'build-identity-history'),
      BUILD_EDUCATION_ROLLUP: path.join(STUBS, 'build-education-rollup'),
      BUILD_REPORTS_ROLLUPS: path.join(STUBS, 'build-reports-rollups'),
      STUB_LOG: stubLog,
      STUB_DISK_LOG: diskLog,
      RUN_MANIFEST_FILE: path.join(tmp, 'run', 'written.jsonl'),
      RUN_REMOVALS_FILE: path.join(tmp, 'run', 'removed.jsonl'),
      MARCH_CLOSE_RETRY_DELAY: '0',
      ...env,
    },
  })
  let counts: Result['counts']
  try {
    counts = JSON.parse(r.stdout)
  } catch {
    counts = undefined
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, counts }
}

function putObject(objectPath: string, content: string, gzip = false): void {
  const obj = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, gzip ? zlib.gzipSync(content) : content)
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(meta, gzip ? 'content-encoding=gzip\n' : '')
}

function putRaw(date: string): void {
  putObject(`raw-csv/${date}/district-61/club-performance.csv`, 'Club,Goals\n')
}

/** The live object: stored gzip-encoded, like every snapshot object. */
function putBaseline(): void {
  putObject(BASELINE_OBJECT, BASELINE_BODY, true)
}

function objectsUnder(prefix: string): string[] {
  const dir = path.join(root, BUCKET, prefix)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort()
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

function summaryText(): string {
  return fs.existsSync(summary) ? fs.readFileSync(summary, 'utf-8') : ''
}

/** Shim calls that copied the March-close object. */
function baselineCopies(): string[] {
  return lines(shimLog).filter(l =>
    l.startsWith(`storage cp gs://${BUCKET}/${BASELINE_OBJECT} `)
  )
}

/** What each collector-cli call found under $CACHE_DIR (STUB_DISK_LOG). */
function diskAt(command: string): string[] {
  return lines(diskLog)
    .filter(l => l.startsWith(`${command}: `))
    .map(l => l.slice(command.length + 2))
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-dates-march-'))
  root = path.join(tmp, 'gcs')
  cache = path.join(tmp, 'cache')
  shimLog = path.join(tmp, 'gcloud.log')
  stubLog = path.join(tmp, 'stubs.log')
  diskLog = path.join(tmp, 'disk.log')
  summary = path.join(tmp, 'summary.md')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('process-dates.sh: March-close baseline pull (#1614)', () => {
  it('does not pull it for a date outside April to June', () => {
    putRaw('2026-09-10')
    putBaseline()
    const r = run('rebuild', ['2026-09-10'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    expect(baselineCopies()).toEqual([])
    expect(diskAt('transform')).not.toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 0 present, 0 absent, 0 failed'
    )
  })

  it('copies it to baselines/march-close/ before the transform of an April–June date', () => {
    putRaw('2026-05-31')
    putBaseline()
    const r = run('rebuild', ['2026-05-31'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    expect(diskAt('transform')).toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 1 present, 0 absent, 0 failed'
    )
  })

  it('never writes the baseline under snapshots/ in the cache (the remap diff reads it)', () => {
    putRaw('2026-05-31')
    putBaseline()
    const r = run('rebuild', ['2026-05-31'])
    expect(r.status, r.stderr).toBe(0)
    const all = lines(diskLog)
    expect(all.some(l => l.includes('snapshots/2026-03-31'))).toBe(false)
    // The remap still picked the transform's own date.
    expect(objectsUnder('snapshots/2026-05-31')).toContain('district_61.json')
    expect(objectsUnder('snapshots/2026-03-31')).toEqual([
      'all-districts-rankings.json',
    ])
  })

  it('leaves plain JSON on disk whether or not the download inflated the gzip object', () => {
    for (const decompress of ['1', '0']) {
      putRaw('2026-04-30')
      putBaseline()
      const copy = path.join(tmp, `baseline-${decompress}.json`)
      const r = run('rebuild', ['2026-04-30'], {
        SHIM_DOWNLOAD_DECOMPRESS: decompress,
        STUB_COPY_ON_COMPUTE: `${BASELINE_LOCAL}=${copy}`,
      })
      expect(r.status, r.stderr).toBe(0)
      expect(JSON.parse(fs.readFileSync(copy, 'utf-8'))).toEqual(
        JSON.parse(BASELINE_BODY)
      )
    }
  })

  it('decides on the logical date: a July collection remapped onto June 30 is in the window', () => {
    putRaw('2026-07-03')
    putBaseline()
    const r = run('rebuild', ['2026-07-03'], {
      STUB_REMAP: '2026-07-03=2026-06-30',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(diskAt('transform')).toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 1 present, 0 absent, 0 failed'
    )
  })

  it('does not count a July collection that stays in July, and removes its copy', () => {
    putRaw('2026-07-15')
    putBaseline()
    const r = run('rebuild', ['2026-07-15'])
    expect(r.status, r.stderr).toBe(0)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 0 present, 0 absent, 0 failed'
    )
    expect(fs.existsSync(path.join(cache, BASELINE_LOCAL))).toBe(false)
  })

  it('pulls it for a daily June close collected in July', () => {
    putBaseline()
    const r = run('daily', ['2026-07-03'], {
      DISTRICTS: '61',
      STUB_REMAP: '2026-07-03=2026-06-30',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    expect(diskAt('scrape')).toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 1 present, 0 absent, 0 failed'
    )
  })

  it('logs a missing March close and goes on: the award shows baseline-missing', () => {
    putRaw('2026-05-31')
    const r = run('rebuild', ['2026-05-31'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    expect(r.stderr).toContain(
      `No March close at gs://${BUCKET}/${BASELINE_OBJECT}`
    )
    expect(baselineCopies()).toHaveLength(1)
    expect(diskAt('transform')).not.toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 0 present, 1 absent, 0 failed'
    )
  })

  it('retries a transient copy failure', () => {
    putRaw('2026-05-31')
    putBaseline()
    const r = run('rebuild', ['2026-05-31'], {
      SHIM_FAIL_MATCH: FAIL_BASELINE,
      SHIM_FAIL_TIMES: '1',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(baselineCopies()).toHaveLength(2)
    expect(diskAt('transform')).toContain(BASELINE_LOCAL)
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 1 present, 0 absent, 0 failed'
    )
  })

  it('fails the step when the object exists but every copy fails, uploading nothing for the date', () => {
    putRaw('2026-05-31')
    putBaseline()
    const r = run('rebuild', ['2026-05-31'], {
      SHIM_FAIL_MATCH: FAIL_BASELINE,
    })
    expect(r.status).toBe(1)
    expect(baselineCopies()).toHaveLength(3)
    expect(r.stderr).toMatch(/::error::.*March close/)
    expect(objectsUnder('snapshots/2026-05-31')).toEqual([])
    expect(summaryText()).toContain(
      '- **March-close baseline (#1614)**: 0 present, 0 absent, 1 failed'
    )
  })

  it('does not fail a date whose logical month is outside the window, even if the copy fails', () => {
    putRaw('2026-07-15')
    putBaseline()
    const r = run('rebuild', ['2026-07-15'], {
      SHIM_FAIL_MATCH: FAIL_BASELINE,
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
  })
})
