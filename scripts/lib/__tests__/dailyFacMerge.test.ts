/**
 * scripts/pipeline/daily-fac-merge.sh — the daily Find-A-Club merge with a
 * persisted fallback (#1770, ADR-015 P1/P2, audit D-10).
 *
 * The daily fetch and merge used to be `continue-on-error`: a TI outage (or a
 * single failed district, which exits PARTIAL_FAILURE) skipped the merge, and
 * the date shipped unenriched with nothing to say so. The merge now always
 * runs: districts the fetch missed take the most recent persisted raw-fac/
 * (#1758), districts with no FAC at all are counted and flagged, and a merge
 * or GCS failure fails the step (fail closed, D7).
 *
 * Runs the REAL script against the gcloud shim and the collector-cli stub
 * (fixtures/process-dates/), whose merge-find-a-club reads the recorded
 * fetch-find-a-club shape (fixtures/process-dates/raw-fac/district_61.json).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/daily-fac-merge.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const FAC_FIXTURE = fs.readFileSync(
  path.join(STUBS, 'raw-fac/district_61.json'),
  'utf-8'
)
const BUCKET = 'test-bucket'
const DATE = '2026-10-11'

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
  out?: {
    districts: number
    fresh: number
    fallback: number
    fallbackDate: string | null
    unenriched: number
  }
}

function run(env: Record<string, string> = {}): Result {
  const r = spawnSync('bash', [SCRIPT, BUCKET, DATE], {
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
      STUB_LOG: stubLog,
      ...env,
    },
  })
  let out: Result['out']
  try {
    out = JSON.parse(r.stdout)
  } catch {
    out = undefined
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out }
}

/** A recorded-shape FAC file for district <id> with <clubs> clubs. */
function fac(id: string, clubs?: number): string {
  const recorded = JSON.parse(FAC_FIXTURE) as { Clubs: unknown[] }
  const body = {
    ...recorded,
    district: id,
    Clubs:
      clubs === undefined
        ? recorded.Clubs
        : Array.from({ length: clubs }, () => recorded.Clubs[0]),
  }
  return JSON.stringify(body)
}

function putPersisted(date: string, ids: string[], clubs?: number): void {
  for (const id of ids) {
    const obj = path.join(root, BUCKET, `raw-fac/${date}/district_${id}.json`)
    fs.mkdirSync(path.dirname(obj), { recursive: true })
    fs.writeFileSync(obj, fac(id, clubs))
    const meta = path.join(
      root,
      '.meta',
      BUCKET,
      `raw-fac/${date}/district_${id}.json`
    )
    fs.mkdirSync(path.dirname(meta), { recursive: true })
    fs.writeFileSync(meta, '')
  }
}

function putFresh(ids: string[], clubs?: number): void {
  const dir = path.join(cache, 'find-a-club', DATE)
  fs.mkdirSync(dir, { recursive: true })
  for (const id of ids) {
    fs.writeFileSync(path.join(dir, `district_${id}.json`), fac(id, clubs))
  }
}

function putSnapshots(ids: string[]): void {
  const dir = path.join(cache, 'snapshots', DATE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'metadata.json'), '{}')
  for (const id of ids) {
    fs.writeFileSync(
      path.join(dir, `district_${id}.json`),
      JSON.stringify({ districtId: id })
    )
  }
}

function snapshot(id: string): { facMergedClubs?: number } {
  return JSON.parse(
    fs.readFileSync(
      path.join(cache, 'snapshots', DATE, `district_${id}.json`),
      'utf-8'
    )
  )
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

function merges(): string[] {
  return lines(stubLog).filter(l => l.includes('merge-find-a-club'))
}

function summaryText(): string {
  return fs.existsSync(summary) ? fs.readFileSync(summary, 'utf-8') : ''
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-fac-merge-'))
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

describe('daily-fac-merge.sh: a clean fetch', () => {
  it('merges the fresh FAC and never looks at raw-fac/', () => {
    putSnapshots(['61', '62'])
    putFresh(['61', '62'])
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.out).toEqual({
      districts: 2,
      fresh: 2,
      fallback: 0,
      fallbackDate: null,
      unenriched: 0,
    })
    expect(merges()).toHaveLength(1)
    expect(snapshot('61').facMergedClubs).toBe(2)
    expect(snapshot('62').facMergedClubs).toBe(2)
    expect(lines(shimLog)).toEqual([])
  })

  it('prints ONLY the result JSON on stdout (R4)', () => {
    putSnapshots(['61'])
    putFresh(['61'])
    const r = run()
    expect(r.stdout.trim().split('\n')).toHaveLength(1)
  })
})

describe('daily-fac-merge.sh: the fetch failed (TI outage, D-10)', () => {
  it('merges the most recent persisted raw-fac/ before the date, and reports it', () => {
    putSnapshots(['61', '62'])
    putPersisted('2026-10-08', ['61', '62'], 5)
    putPersisted('2026-10-10', ['61', '62'])
    // A later date (a re-derivation's leftovers) is never "the last good FAC".
    putPersisted('2026-10-12', ['61', '62'], 7)
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.out).toEqual({
      districts: 2,
      fresh: 0,
      fallback: 2,
      fallbackDate: '2026-10-10',
      unenriched: 0,
    })
    expect(merges()).toHaveLength(1)
    expect(snapshot('61').facMergedClubs).toBe(2)
    expect(snapshot('62').facMergedClubs).toBe(2)
    expect(r.stderr).toContain('::warning::')
    const md = summaryText()
    expect(md).toContain('- **Fresh FAC (today’s fetch)**: 0')
    expect(md).toContain(
      '- **Fallback FAC (persisted raw-fac/2026-10-10/)**: 2'
    )
    expect(md).toContain('- **Unenriched (no FAC at all)**: 0')
  })

  it('a partial fetch: fresh districts keep their fresh FAC, the missing ones fall back', () => {
    putSnapshots(['61', '62'])
    putFresh(['61'], 1)
    putPersisted('2026-10-10', ['61', '62'], 4)
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.out).toMatchObject({ fresh: 1, fallback: 1, unenriched: 0 })
    expect(snapshot('61').facMergedClubs).toBe(1)
    expect(snapshot('62').facMergedClubs).toBe(4)
  })

  it('never writes the fallback into the fetch directory (raw-fac/<date>/ stays what <date> fetched)', () => {
    putSnapshots(['61', '62'])
    putFresh(['61'])
    putPersisted('2026-10-10', ['62'])
    run()
    expect(
      fs.readdirSync(path.join(cache, 'find-a-club', DATE)).sort()
    ).toEqual(['district_61.json'])
  })

  it('no persisted FAC either: no merge, published unenriched, counted and flagged', () => {
    putSnapshots(['61', '62'])
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.out).toEqual({
      districts: 2,
      fresh: 0,
      fallback: 0,
      fallbackDate: null,
      unenriched: 2,
    })
    expect(merges()).toEqual([])
    expect(r.stderr).toMatch(/::warning::2 district\(s\) of 2026-10-11/)
    expect(summaryText()).toContain('- **Unenriched (no FAC at all)**: 2')
  })

  it('a district missing from the fallback date is counted unenriched', () => {
    putSnapshots(['61', '62'])
    putPersisted('2026-10-10', ['61'])
    const r = run()
    expect(r.out).toMatchObject({ fallback: 1, unenriched: 1 })
    expect(snapshot('62').facMergedClubs).toBeUndefined()
  })
})

describe('daily-fac-merge.sh: fails closed', () => {
  it('cannot list raw-fac/ (a GCS error is not "no FAC"): exit 1, no merge', () => {
    putSnapshots(['61'])
    const r = run({ SHIM_FAIL_MATCH: '^ls ' })
    expect(r.status).toBe(1)
    expect(merges()).toEqual([])
  })

  it('cannot download the fallback: exit 1, no merge', () => {
    putSnapshots(['61'])
    putPersisted('2026-10-10', ['61'])
    const r = run({ SHIM_FAIL_MATCH: '^rsync ' })
    expect(r.status).toBe(1)
    expect(merges()).toEqual([])
  })

  it('a merge failure fails the step (D7; it was continue-on-error)', () => {
    putSnapshots(['61'])
    putFresh(['61'])
    const r = run({ STUB_MERGE_FAIL: `^${DATE}$` })
    expect(r.status).toBe(1)
  })

  it('no snapshot directory: exit 1', () => {
    expect(run().status).toBe(1)
  })
})
