/**
 * #2695 — the pipeline writes no raw source prefix (`raw-fac/`,
 * `raw-education-ledger/`) to the staging bucket. Raw sources move to a
 * private bucket that the pipeline cannot write yet, so the writes are
 * paused behind one config value (scripts/pipeline/raw-source-config.sh):
 * RAW_SOURCE_BUCKET, empty (disabled) by default.
 *
 * Runs the REAL daily-fac-fetch.sh against the gcloud shim and the
 * collector-cli stub (fixtures/process-dates/).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const FETCH = path.join(REPO, 'scripts/pipeline/daily-fac-fetch.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const STAGING = 'test-staging'
const PRIVATE = 'test-raw-private'
const DATE = '2026-10-23'

let tmp: string
let root: string
let shimLog: string

function fetchFac(env: Record<string, string> = {}) {
  return spawnSync('bash', [FETCH, STAGING, DATE, '61'], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      SHIM_LOG: shimLog,
      CACHE_DIR: path.join(tmp, 'cache'),
      RUN_MANIFEST_FILE: path.join(tmp, 'manifest.jsonl'),
      GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
      COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
      STUB_LOG: path.join(tmp, 'stubs.log'),
      ...env,
    },
  })
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
  it('writes nothing under raw-fac/ to the staging bucket by default', () => {
    const r = fetchFac()
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ fetched: 1, persisted: 0 })
    expect(objects(STAGING, 'raw-fac')).toEqual([])
    const toStaging = gcloudCalls().filter(
      l =>
        l.includes(`gs://${STAGING}/raw-fac/`) ||
        l.includes(`gs://${STAGING}/raw-education-ledger/`)
    )
    expect(toStaging).toEqual([])
  })

  it('says on stderr that the persist is paused (R4)', () => {
    const r = fetchFac()
    expect(r.stderr).toMatch(/raw-fac\/.*paused|paused.*raw-fac\//)
    expect(r.stdout).not.toMatch(/paused/)
  })

  it('writes to the configured raw-source bucket, never staging, when one is set', () => {
    const r = fetchFac({ RAW_SOURCE_BUCKET: PRIVATE })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ fetched: 1, persisted: 1 })
    expect(objects(PRIVATE, `raw-fac/${DATE}`)).toEqual(['district_61.json'])
    expect(objects(STAGING, 'raw-fac')).toEqual([])
  })
})
