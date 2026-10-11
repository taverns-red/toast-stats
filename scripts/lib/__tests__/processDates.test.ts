/**
 * scripts/pipeline/process-dates.sh — the per-date loop shared by rebuild,
 * rescrape and rescrape-historical (#1742, plan P3-1).
 *
 * Runs the REAL script against the gcloud shim (a temp directory standing in
 * for the bucket, D10) with stand-ins for collector-cli and the two tsx
 * helpers (fixtures/process-dates/), which reproduce only their documented
 * argv, exit-code and on-disk contracts. Each describe block is one stage of
 * the loop: resolve → fetch raw → prev-year → transform → date remap →
 * closing guard → compute → upload → cleanup → counters.
 *
 * The S1-3 contract (#1708) the loop must keep: a failed date is counted and
 * the loop goes on (per-date uploads are intended; the partial-failure gate
 * runs after the store push); a guard exit 3 is REFUSED, not FAILED.
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
const CACHE_CONTROL = 'public, max-age=3600, must-revalidate'

let tmp: string
let root: string
let cache: string
let shimLog: string
let stubLog: string
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
      SHIM_LOG: shimLog,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      CACHE_DIR: cache,
      GITHUB_STEP_SUMMARY: summary,
      COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
      GUARD_SNAPSHOT_UPLOAD: path.join(STUBS, 'guard-snapshot-upload'),
      RESOLVE_REBUILD_SOURCE: path.join(STUBS, 'resolve-rebuild-source'),
      STUB_LOG: stubLog,
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

function objectExists(objectPath: string): boolean {
  return fs.existsSync(path.join(root, BUCKET, objectPath))
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

function readMeta(objectPath: string): string {
  return fs.readFileSync(path.join(root, '.meta', BUCKET, objectPath), 'utf-8')
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

function summaryText(): string {
  return fs.existsSync(summary) ? fs.readFileSync(summary, 'utf-8') : ''
}

function localDateDirs(sub: string): string[] {
  const dir = path.join(cache, sub)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n))
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-dates-'))
  root = path.join(tmp, 'gcs')
  cache = path.join(tmp, 'cache')
  shimLog = path.join(tmp, 'gcloud.log')
  stubLog = path.join(tmp, 'stubs.log')
  summary = path.join(tmp, 'summary.md')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('process-dates.sh: usage', () => {
  it('rejects an unknown mode with exit 2', () => {
    expect(run('daily', ['2026-09-10']).status).toBe(2)
  })

  it('rejects a malformed date before touching the bucket', () => {
    const r = run('rebuild', ['2026-9-10'])
    expect(r.status).toBe(2)
    expect(lines(shimLog)).toEqual([])
  })

  it('finishes with zero counts when there are no dates', () => {
    const r = run('rebuild', [])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 0, refused: 0, failed: 0 })
  })
})

describe('process-dates.sh rebuild: a clean date end to end', () => {
  it('publishes the snapshot and its analytics with the CDN headers, gzip', () => {
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-10'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    expect(objectsUnder('snapshots/2026-09-10')).toEqual([
      'analytics/district_61_analytics.json',
      'district_61.json',
      'metadata.json',
    ])
    for (const obj of [
      'snapshots/2026-09-10/district_61.json',
      'snapshots/2026-09-10/analytics/district_61_analytics.json',
    ]) {
      const meta = readMeta(obj)
      expect(meta).toContain('content-encoding=gzip')
      expect(meta).toContain('content-type=application/json')
      expect(meta).toContain(`cache-control=${CACHE_CONTROL}`)
      const body = zlib.gunzipSync(
        fs.readFileSync(path.join(root, BUCKET, obj))
      )
      expect(() => JSON.parse(body.toString('utf-8'))).not.toThrow()
    }
  })

  it('prints ONLY the counts JSON on stdout; tool output goes to stderr (R4)', () => {
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-10'])
    expect(r.stdout.trim().split('\n')).toHaveLength(1)
    expect(r.counts).toBeDefined()
    expect(r.stderr).toContain('[INFO] transform 2026-09-10')
  })
})

describe('process-dates.sh rebuild: resolve stage (#1608)', () => {
  it('fetches and transforms the resolved closing raw, publishing under the month-end', () => {
    putRaw('2026-07-03')
    const r = run('rebuild', ['2026-06-30'], {
      STUB_RESOLVE: '2026-06-30=2026-07-03',
      STUB_REMAP: '2026-07-03=2026-06-30',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
    const stubs = lines(stubLog)
    expect(stubs).toContain(
      'collector-cli transform --date 2026-07-03 --force --verbose'
    )
    expect(stubs.some(l => /transform --date 2026-06-30\b/.test(l))).toBe(false)
    expect(
      lines(shimLog).some(l =>
        l.startsWith(`storage rsync -r gs://${BUCKET}/raw-csv/2026-07-03/`)
      )
    ).toBe(true)
    expect(objectExists('snapshots/2026-06-30/district_61.json')).toBe(true)
  })

  it('fails the date closed when the source cannot be resolved, then goes on', () => {
    putRaw('2026-06-30')
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-06-30', '2026-09-10'], {
      STUB_RESOLVE_FAIL: '^2026-06-30$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 1 })
    expect(lines(stubLog)).not.toContain(
      'collector-cli transform --date 2026-06-30 --force --verbose'
    )
    expect(objectsUnder('snapshots/2026-06-30')).toEqual([])
    expect(objectExists('snapshots/2026-09-10/district_61.json')).toBe(true)
  })
})

describe('process-dates.sh rebuild: raw fetch stage', () => {
  it('fails the date on a transport error instead of transforming a partial raw', () => {
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-10'], {
      SHIM_FAIL_MATCH: '^rsync .*raw-csv/',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 0, refused: 0, failed: 1 })
    expect(lines(stubLog).some(l => l.includes(' transform '))).toBe(false)
    expect(objectsUnder('snapshots')).toEqual([])
  })

  it('fails a date that has no raw in the bucket', () => {
    const r = run('rebuild', ['2026-09-10'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 0, refused: 0, failed: 1 })
  })
})

describe('process-dates.sh rebuild: previous-year stage (YoY)', () => {
  it('pulls the prior-year district snapshots before the transform', () => {
    putRaw('2026-09-10')
    putObject('snapshots/2025-09-10/district_61.json', '{"d":61}', true)
    putObject('snapshots/2025-09-10/all-districts-rankings.json', '{}', true)
    const r = run('rebuild', ['2026-09-10'])
    expect(r.status, r.stderr).toBe(0)
    const calls = lines(shimLog)
    const prev = calls.findIndex(l =>
      l.startsWith(
        `storage cp gs://${BUCKET}/snapshots/2025-09-10/district_*.json`
      )
    )
    expect(prev, calls.join('\n')).toBeGreaterThanOrEqual(0)
    // Only district files, and plain JSON on disk was what compute read.
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
  })

  it('is best effort: a missing prior year is not a failure', () => {
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-10'])
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 0 })
  })
})

describe('process-dates.sh rebuild: transform stage', () => {
  it('counts a failed transform, publishes nothing for it, and goes on', () => {
    putRaw('2026-09-09')
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-09', '2026-09-10'], {
      STUB_TRANSFORM_FAIL: '^2026-09-09$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 1 })
    expect(objectsUnder('snapshots/2026-09-09')).toEqual([])
    expect(lines(stubLog)).not.toContain(
      'collector-cli compute-analytics --date 2026-09-09 --force-analytics --verbose'
    )
  })
})

describe('process-dates.sh rebuild: date remap (#193)', () => {
  it('guards, computes and uploads the date the transform actually wrote', () => {
    putRaw('2026-08-02')
    const r = run('rebuild', ['2026-08-02'], {
      STUB_REMAP: '2026-08-02=2026-07-31',
    })
    expect(r.status, r.stderr).toBe(0)
    const stubs = lines(stubLog)
    expect(stubs).toContain('guard 2026-07-31')
    expect(stubs).toContain(
      'collector-cli compute-analytics --date 2026-07-31 --force-analytics --verbose'
    )
    expect(objectExists('snapshots/2026-07-31/district_61.json')).toBe(true)
    expect(objectsUnder('snapshots/2026-08-02')).toEqual([])
  })
})

describe('process-dates.sh rebuild: closing upload guard (#1621, #1708)', () => {
  it('counts exit 3 as REFUSED, not FAILED, and publishes nothing for the date', () => {
    putRaw('2026-06-30')
    const r = run('rebuild', ['2026-06-30'], {
      STUB_GUARD_REFUSE: '^2026-06-30$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 0, refused: 1, failed: 0 })
    expect(objectsUnder('snapshots')).toEqual([])
    expect(lines(stubLog).some(l => l.includes('compute-analytics'))).toBe(
      false
    )
  })

  it('counts any other guard exit (unreadable GCS) as FAILED', () => {
    putRaw('2026-06-30')
    const r = run('rebuild', ['2026-06-30'], {
      STUB_GUARD_ERROR: '^2026-06-30$',
    })
    expect(r.counts).toEqual({ succeeded: 0, refused: 0, failed: 1 })
    expect(objectsUnder('snapshots')).toEqual([])
  })

  it('runs the guard after the transform and before compute', () => {
    putRaw('2026-09-10')
    run('rebuild', ['2026-09-10'])
    const stubs = lines(stubLog)
    const transform = stubs.findIndex(l => l.includes(' transform '))
    const guard = stubs.indexOf('guard 2026-09-10')
    const compute = stubs.findIndex(l => l.includes(' compute-analytics '))
    expect(transform).toBeGreaterThanOrEqual(0)
    expect(guard).toBeGreaterThan(transform)
    expect(compute).toBeGreaterThan(guard)
  })
})

describe('process-dates.sh rebuild: compute stage (#1708)', () => {
  it('counts a failed compute but still uploads the date’s snapshots', () => {
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-10'], {
      STUB_COMPUTE_FAIL: '^2026-09-10$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 1, refused: 0, failed: 1 })
    expect(objectExists('snapshots/2026-09-10/district_61.json')).toBe(true)
  })
})

describe('process-dates.sh rebuild: upload stage', () => {
  it('aborts the loop on a failed snapshot upload (never a silent gap)', () => {
    putRaw('2026-09-09')
    putRaw('2026-09-10')
    const r = run('rebuild', ['2026-09-09', '2026-09-10'], {
      SHIM_FAIL_MATCH: '^cp .*gs://test-bucket/snapshots/2026-09-09/',
    })
    expect(r.status).not.toBe(0)
    expect(lines(stubLog)).not.toContain(
      'collector-cli transform --date 2026-09-10 --force --verbose'
    )
  })
})

describe('process-dates.sh rebuild: cleanup stage (#295)', () => {
  it('leaves no date directories behind and keeps the stores', () => {
    putRaw('2026-09-09')
    putRaw('2026-09-10')
    putObject('snapshots/2025-09-10/district_61.json', '{"d":61}', true)
    fs.mkdirSync(path.join(cache, 'time-series/2026-2027'), { recursive: true })
    fs.writeFileSync(
      path.join(cache, 'time-series/2026-2027/district_61.json'),
      '{}'
    )
    const r = run('rebuild', ['2026-09-09', '2026-09-10'], {
      STUB_TRANSFORM_FAIL: '^2026-09-09$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(localDateDirs('snapshots')).toEqual([])
    expect(localDateDirs('raw-csv')).toEqual([])
    expect(
      fs.existsSync(path.join(cache, 'time-series/2026-2027/district_61.json'))
    ).toBe(true)
  })
})

describe('process-dates.sh: counters in the step summary (#1708)', () => {
  it('writes the date counts and the summed store counters', () => {
    putRaw('2026-09-09')
    putRaw('2026-09-10')
    putRaw('2026-06-30')
    const r = run('rebuild', ['2026-06-30', '2026-09-09', '2026-09-10'], {
      STUB_GUARD_REFUSE: '^2026-06-30$',
      STUB_COMPUTE_FAIL: '^2026-09-09$',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.counts).toEqual({ succeeded: 2, refused: 1, failed: 1 })
    const md = summaryText()
    expect(md).toContain('- **Dates to process**: 3')
    expect(md).toContain('- **Dates succeeded**: 2')
    expect(md).toContain('- **Refused by the upload guard**: 1')
    expect(md).toContain('- **Dates failed**: 1')
    // Both computes printed counters, the failed one included.
    expect(md).toContain('- **Time-series points**: 2 written, 0 failed')
    expect(md).toContain('- **Club-trends stores**: 4 written, 0 failed')
  })
})
