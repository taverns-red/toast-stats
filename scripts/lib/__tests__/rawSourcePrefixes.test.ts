/**
 * #2695 — the pipeline reads and writes no raw source prefix (`raw-fac/`,
 * `raw-education-ledger/`) in the staging bucket. Raw sources live in a
 * private bucket named in ONE place, scripts/pipeline/raw-source-config.sh
 * (RAW_SOURCE_BUCKET).
 *
 * Runs the REAL daily-fac-fetch.sh and daily-fac-merge.sh against the gcloud
 * shim and the collector-cli stub (fixtures/process-dates/).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const FETCH = path.join(REPO, 'scripts/pipeline/daily-fac-fetch.sh')
const MERGE = path.join(REPO, 'scripts/pipeline/daily-fac-merge.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const STAGING = 'test-staging'
const PRIVATE = 'toast-stats-raw-private'
const DATE = '2026-10-23'

let tmp: string
let root: string
let shimLog: string

function env(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = {
    ...process.env,
    GCLOUD: SHIM,
    SHIM_ROOT: root,
    SHIM_LOG: shimLog,
    SHIM_DOWNLOAD_DECOMPRESS: '1',
    CACHE_DIR: path.join(tmp, 'cache'),
    RUN_MANIFEST_FILE: path.join(tmp, 'manifest.jsonl'),
    GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
    COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
    STUB_LOG: path.join(tmp, 'stubs.log'),
  }
  delete e.RAW_SOURCE_BUCKET
  return e
}

function objects(bucket: string, prefix: string): string[] {
  const dir = path.join(root, bucket, prefix)
  return fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).map(String)
    : []
}

function gcloudCalls(): string[] {
  return fs.existsSync(shimLog)
    ? fs.readFileSync(shimLog, 'utf-8').split('\n').filter(Boolean)
    : []
}

const touchesStagingRaw = (l: string) =>
  l.includes(`gs://${STAGING}/raw-fac`) ||
  l.includes(`gs://${STAGING}/raw-education-ledger`)

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-source-prefixes-'))
  root = path.join(tmp, 'gcs')
  shimLog = path.join(tmp, 'gcloud.log')
  fs.mkdirSync(path.join(root, STAGING), { recursive: true })
  fs.mkdirSync(path.join(root, PRIVATE), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('daily-fac-fetch.sh: raw-fac/ persistence (#2695)', () => {
  it('writes raw-fac/ to the private raw-source bucket, never to staging', () => {
    const r = spawnSync('bash', [FETCH, STAGING, DATE, '61'], {
      cwd: REPO,
      encoding: 'utf-8',
      env: env(),
    })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ fetched: 1, persisted: 1 })
    expect(objects(PRIVATE, `raw-fac/${DATE}`)).toEqual(['district_61.json'])
    expect(objects(STAGING, 'raw-fac')).toEqual([])
    expect(gcloudCalls().filter(touchesStagingRaw)).toEqual([])
  })
})

describe('daily-fac-merge.sh: the fallback read (#2695)', () => {
  it('lists and downloads the persisted raw-fac/ from the private bucket only', () => {
    const cache = path.join(tmp, 'cache')
    const snap = path.join(cache, 'snapshots', DATE)
    fs.mkdirSync(snap, { recursive: true })
    fs.writeFileSync(path.join(snap, 'metadata.json'), '{}')
    fs.writeFileSync(path.join(snap, 'district_61.json'), '{"districtId":"61"}')
    const prior = path.join(root, PRIVATE, 'raw-fac/2026-10-20')
    fs.mkdirSync(prior, { recursive: true })
    fs.copyFileSync(
      path.join(STUBS, 'raw-fac/district_61.json'),
      path.join(prior, 'district_61.json')
    )
    const meta = path.join(root, '.meta', PRIVATE, 'raw-fac/2026-10-20')
    fs.mkdirSync(meta, { recursive: true })
    fs.writeFileSync(path.join(meta, 'district_61.json'), '')
    const r = spawnSync('bash', [MERGE, STAGING, DATE], {
      cwd: REPO,
      encoding: 'utf-8',
      env: env(),
    })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout).fallbackDate).toBe('2026-10-20')
    const raw = gcloudCalls().filter(l => l.includes('raw-fac'))
    expect(raw.length).toBeGreaterThan(0)
    expect(raw.every(l => l.includes(`gs://${PRIVATE}/raw-fac`))).toBe(true)
  })
})

describe('no pipeline script addresses a raw prefix in the staging bucket', () => {
  const dir = path.join(REPO, 'scripts/pipeline')
  const code = (f: string) =>
    fs
      .readFileSync(path.join(dir, f), 'utf-8')
      .split('\n')
      .filter(l => !/^\s*#/.test(l))
      .join('\n')

  it.each(fs.readdirSync(dir).filter(f => f.endsWith('.sh')))('%s', f => {
    expect(code(f)).not.toMatch(
      /\$\{(GCS_)?BUCKET\}\/raw-(fac|education-ledger)/
    )
  })

  it('the default raw-source bucket is the private one', () => {
    expect(code('raw-source-config.sh')).toContain(
      'RAW_SOURCE_BUCKET:-toast-stats-raw-private'
    )
  })
})
