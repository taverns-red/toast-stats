/**
 * Identity histories in the pipeline (#1782, epic #1781; ADR-015 parity).
 *
 * One script, scripts/pipeline/build-identity-history.sh, builds the
 * club-district history from the runner's club-race store and uploads it to
 * STAGING `derived/` — a prefix promotion never copies, until scoped
 * promotion (#1763, ADR-015 step 5) lists it in the run manifest and moves
 * it under `config/`. It is not a daily-only stage: daily calls it after its
 * upload, and process-dates.sh (rebuild, rescrape, rescrape-historical) calls
 * it once after its date loop. The contracts here:
 *   1. the script, run for real against the gcloud shim (D10), writes the
 *      schema-valid shards and index, plain JSON, under derived/ only;
 *   2. derived/ is not promoted, and nothing the script runs is a prod write
 *      (the #1755 guard);
 *   3. process-dates.sh invokes it in every mode, once, after the loop, and a
 *      failure is reported but never fails the run;
 *   4. every workflow mode that publishes the club-race store also builds
 *      the history (directly or through process-dates.sh).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
} from '@taverns-red/shared-contracts'
import { prodWriteReasons, type Workflow } from '../prodWriteGuard.js'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/build-identity-history.sh')
const PROCESS_DATES = path.join(REPO, 'scripts/pipeline/process-dates.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STUBS = path.join(REPO, 'scripts/lib/__tests__/fixtures/process-dates')
const CLUB_RACE = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/identity-history/club-race'
)
const BUCKET = 'test-bucket'
const PREFIX = 'derived/club-district-history/'

let tmp: string
let root: string
let cache: string
let shimLog: string
let stubLog: string
let summary: string
let manifest: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-history-'))
  root = path.join(tmp, 'gcs')
  cache = path.join(tmp, 'cache')
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
    CACHE_DIR: cache,
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

function seedClubRace(): void {
  fs.cpSync(CLUB_RACE, path.join(cache, 'club-race'), { recursive: true })
}

function allObjects(): string[] {
  const dir = path.join(root, BUCKET)
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort()
}

function readObject(objectPath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(root, BUCKET, objectPath), 'utf-8')
  )
}

function readMeta(objectPath: string): string {
  return fs.readFileSync(path.join(root, '.meta', BUCKET, objectPath), 'utf-8')
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

describe('build-identity-history.sh: club-district history to staging derived/', () => {
  it('uploads the schema-valid index and one shard per club-id suffix', () => {
    seedClubRace()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(allObjects()).toEqual(
      ['02', '07', '45', '68', '77', '99', 'index']
        .map(k => `${PREFIX}${k}.json`)
        .sort()
    )
    const index = ClubDistrictHistoryIndexSchema.parse(
      readObject(`${PREFIX}index.json`)
    )
    expect(index.totalClubs).toBe(6)
    const shard = ClubDistrictHistoryShardSchema.parse(
      readObject(`${PREFIX}77.json`)
    )
    expect(shard.clubs['977']?.spans.map(s => s.districtId)).toEqual([
      '01',
      '201',
    ])
  })

  it('uploads plain JSON with a JSON content type (internal, no -Z)', () => {
    seedClubRace()
    expect(runScript().status).toBe(0)
    const meta = readMeta(`${PREFIX}index.json`)
    expect(meta).not.toContain('content-encoding=gzip')
    expect(meta).toContain('content-type=application/json')
  })

  it('prints one JSON summary line on stdout (R4) and reports gzip sizes', () => {
    seedClubRace()
    const r = runScript()
    const out = r.stdout.trim().split('\n')
    expect(out).toHaveLength(1)
    const parsed = JSON.parse(out[0]!)
    expect(parsed.clubDistrictHistory).toMatchObject({
      clubs: 6,
      shards: 6,
      duplicates: 0,
    })
    expect(parsed.clubDistrictHistory.gzipBytes).toBeGreaterThan(0)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /club-district history.*6 clubs/i
    )
  })

  it('refuses (exit 1, nothing uploaded) when the club-race store was never synced', () => {
    const r = runScript()
    expect(r.status).toBe(1)
    expect(allObjects()).toEqual([])
  })

  it('writes nothing outside derived/', () => {
    seedClubRace()
    runScript()
    expect(allObjects().every(o => o.startsWith('derived/'))).toBe(true)
    const writes = lines(shimLog).filter(l => /^storage (cp|rsync)/.test(l))
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      const dest = w.split(' ').at(-1) ?? ''
      expect(dest.startsWith(`gs://${BUCKET}/derived/`), w).toBe(true)
    }
  })

  it('records every derived/ object in the run manifest, with the sha256 of its bytes (#1762, ADR-015 P5)', () => {
    seedClubRace()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const recorded = lines(manifest).map(
      l => JSON.parse(l) as { path: string; sha256: string; stage: string }
    )
    expect(recorded.map(e => e.path).sort()).toEqual(allObjects())
    for (const e of recorded) {
      expect(e.stage).toBe('identity')
      const bytes = fs.readFileSync(path.join(root, BUCKET, e.path))
      expect(e.sha256, e.path).toBe(
        createHash('sha256').update(bytes).digest('hex')
      )
    }
  })
})

describe('derived/ is staging-only until #1763', () => {
  it('is not under any promoted prefix', () => {
    expect(PROMOTED_PREFIXES.some(p => 'derived/'.startsWith(p))).toBe(false)
    expect(PROMOTED_PREFIXES.some(p => PREFIX.startsWith(p))).toBe(false)
  })

  it('the script makes no prod write (the #1755 prod-write guard)', () => {
    const text = fs.readFileSync(SCRIPT, 'utf-8')
    expect(prodWriteReasons(text)).toEqual([])
    expect(text).not.toMatch(/GCS_BUCKET_PRODUCTION|toast-stats-data-ca/)
  })

  it('the promote step never names derived/', () => {
    const wf = parse(
      fs.readFileSync(
        path.join(REPO, '.github/workflows/data-pipeline.yml'),
        'utf-8'
      )
    ) as Workflow
    const promote = wf.jobs.pipeline?.steps?.find(
      s => s.name === 'Promote staging to production'
    )
    expect(promote, 'no promote step').toBeDefined()
    expect(promote!.run ?? '').not.toContain('derived')
  })
})

describe('process-dates.sh builds the history in every mode (ADR-015 P1)', () => {
  function runProcessDates(
    mode: string,
    env: Record<string, string> = {},
    dates: string[] = []
  ) {
    return spawnSync('bash', [PROCESS_DATES, BUCKET, mode, ...dates], {
      cwd: REPO,
      encoding: 'utf-8',
      env: shimEnv({
        COLLECTOR_CLI: path.join(STUBS, 'collector-cli'),
        GUARD_SNAPSHOT_UPLOAD: path.join(STUBS, 'guard-snapshot-upload'),
        RESOLVE_REBUILD_SOURCE: path.join(STUBS, 'resolve-rebuild-source'),
        VALIDATE_SNAPSHOTS: path.join(STUBS, 'validate-snapshots'),
        BUILD_IDENTITY_HISTORY: path.join(STUBS, 'build-identity-history'),
        STUB_LOG: stubLog,
        DISTRICTS: '61',
        ...env,
      }),
    })
  }

  for (const mode of ['rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: invokes it exactly once, with the bucket`, () => {
      const r = runProcessDates(mode)
      expect(r.status, r.stderr).toBe(0)
      expect(lines(stubLog).filter(l => l.startsWith('identity '))).toEqual([
        `identity ${BUCKET}`,
      ])
    })
  }

  it('runs it after the last date is computed and uploaded', () => {
    fs.mkdirSync(path.join(root, BUCKET, 'raw-csv/2026-09-10/district-61'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(
        root,
        BUCKET,
        'raw-csv/2026-09-10/district-61/club-performance.csv'
      ),
      'Club,Goals\n'
    )
    const r = runProcessDates('rebuild', {}, ['2026-09-10'])
    expect(r.status, r.stderr).toBe(0)
    const stubs = lines(stubLog)
    const compute = stubs.findIndex(l => l.includes(' compute-analytics '))
    expect(compute).toBeGreaterThanOrEqual(0)
    expect(stubs.indexOf(`identity ${BUCKET}`)).toBeGreaterThan(compute)
    expect(
      fs.existsSync(
        path.join(root, BUCKET, 'snapshots/2026-09-10/district_61.json')
      )
    ).toBe(true)
  })

  it('a failed build is reported but does not fail the run or its counts', () => {
    const r = runProcessDates('rebuild', { STUB_IDENTITY_FAIL: '1' })
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      succeeded: 0,
      refused: 0,
      failed: 0,
    })
    expect(r.stderr).toMatch(/::warning::.*identity histor/i)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /identity histories.*FAILED/i
    )
  })
})

describe('every mode that publishes club-race builds the history', () => {
  const wf = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as Workflow
  const steps = wf.jobs.pipeline?.steps ?? []
  const modeOf = (name = '') => /^\[([a-z-]+)\]/.exec(name)?.[1]
  const builds = (run = '') =>
    /scripts\/pipeline\/(build-identity-history|process-dates)\.sh/.test(run)

  const publishers = steps.filter(s =>
    /publish-stores\.sh[^\n]*(\\\n[^\n]*)*club-race/.test(s.run ?? '')
  )

  it('finds the club-race publishers (daily, rebuild, rescrape, rescrape-historical)', () => {
    expect(new Set(publishers.map(s => modeOf(s.name)))).toEqual(
      new Set(['daily', 'rebuild', 'rescrape', 'rescrape-historical'])
    )
  })

  for (const mode of ['daily', 'rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: some step of the mode builds it`, () => {
      expect(steps.some(s => modeOf(s.name) === mode && builds(s.run))).toBe(
        true
      )
    })
  }

  it('daily calls the same script, after its snapshot upload, non-fatally', () => {
    const upload = steps.find(s => s.name === '[daily] Upload to GCS')
    const run = upload?.run ?? ''
    const call = run.indexOf(
      'bash scripts/pipeline/build-identity-history.sh "${GCS_BUCKET}"'
    )
    expect(call, 'daily upload step does not call the script').toBeGreaterThan(
      0
    )
    const snapshotUpload = run.indexOf('"gs://${GCS_BUCKET}/snapshots/')
    expect(snapshotUpload).toBeGreaterThan(0)
    expect(call).toBeGreaterThan(snapshotUpload)
    expect(run.slice(call)).toMatch(/\|\|\s*echo "::warning::/)
  })
})
