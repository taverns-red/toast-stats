/**
 * Identity histories in the pipeline (#1782, epic #1781; ADR-015 parity).
 *
 * One script, scripts/pipeline/build-identity-history.sh, builds the
 * club-district history from the runner's club-race store (#1782) and the
 * district → region history from the staged all-districts rankings (#1820).
 * Both go under `config/`, a promoted prefix: the club history as
 * `config/club-district-history/{NN,index}.json` (#1782), the region
 * history as `config/district-region-history.json` (#1820). The content gate
 * schema-checks them and promotion copies them with the run (whole-prefix
 * rsync, or the run manifest under promotion_scope=manifest, #1763, which
 * copies the club index after its shards). It is not a daily-only stage: daily
 * calls it after its upload, and process-dates.sh (rebuild, rescrape,
 * rescrape-historical) calls it once after its date loop. The contracts here:
 *   1. the script, run for real against the gcloud shim (D10), writes the
 *      schema-valid shards and index and the region history under config/,
 *      plain JSON (identity: config/ is edge-compressed), nothing in derived/;
 *   2. both are global promotion objects with their own content-gate kinds,
 *      and nothing the script runs is a prod write (the #1755 guard);
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
import * as zlib from 'node:zlib'
import { parse } from 'yaml'
import {
  CharterCohortSurvivalFileSchema,
  CharterCohortSurvivalRollupFileSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  ClosedClubNameIndexSchema,
  DistrictRegionHistorySchema,
} from '@taverns-red/shared-contracts'
import { prodWriteReasons, type Workflow } from '../prodWriteGuard.js'
import {
  classifyPromotionPath,
  planManifestPromotion,
} from '../manifestPromotion.js'
import { classifyObject, PROMOTED_PREFIXES } from '../promotionContentGate.js'

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
const RANKINGS = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/identity-history/snapshots'
)
const BUCKET = 'test-bucket'
const PREFIX = 'config/club-district-history/'
const REGION = 'config/district-region-history.json'
const SURVIVAL = 'config/charter-cohort-survival/'
const CLOSED = 'config/closed-club-names.json'

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

/**
 * Stage the recorded rankings at snapshots/<date>/, as the daily and
 * process-dates uploads leave them: `-Z` (Content-Encoding: gzip).
 */
function seedRankings(extraDates: Record<string, string> = {}): void {
  const put = (date: string, from: string) => {
    const obj = `snapshots/${date}/all-districts-rankings.json`
    const dest = path.join(root, BUCKET, obj)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(
      dest,
      zlib.gzipSync(
        fs.readFileSync(
          path.join(RANKINGS, from, 'all-districts-rankings.json')
        )
      )
    )
    const meta = path.join(root, '.meta', BUCKET, obj)
    fs.mkdirSync(path.dirname(meta), { recursive: true })
    fs.writeFileSync(
      meta,
      'content-encoding=gzip\ncontent-type=application/json\n'
    )
  }
  for (const date of fs.readdirSync(RANKINGS)) put(date, date)
  for (const [date, from] of Object.entries(extraDates)) put(date, from)
}

function seedAll(): void {
  seedClubRace()
  seedRankings()
}

function derivedObjects(): string[] {
  return allObjects().filter(o => o.startsWith('derived/'))
}

/**
 * Everything the script may write: the club history, the survival files
 * derived from it (#2061), the closed-club name index (#2062) and the
 * region history.
 */
function writtenObjects(): string[] {
  return allObjects().filter(
    o =>
      o.startsWith(PREFIX) ||
      o.startsWith(SURVIVAL) ||
      o === REGION ||
      o === CLOSED
  )
}

function survivalObjects(): string[] {
  return allObjects().filter(o => o.startsWith(SURVIVAL))
}

function districtSurvivalObjects(): string[] {
  return survivalObjects().filter(o => o.startsWith(`${SURVIVAL}district_`))
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

describe('build-identity-history.sh: club-district history to config/ (#1782)', () => {
  it('uploads the schema-valid index and one shard per club-id suffix', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(derivedObjects()).toEqual([])
    expect(allObjects().filter(o => o.startsWith(PREFIX))).toEqual(
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

  it('uploads plain JSON with a JSON content type (no -Z under config/, #1852)', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    for (const obj of [
      `${PREFIX}index.json`,
      `${PREFIX}77.json`,
      REGION,
      CLOSED,
    ]) {
      const meta = readMeta(obj)
      expect(meta, obj).not.toContain('content-encoding=gzip')
      expect(meta, obj).toContain('content-type=application/json')
    }
  })

  it('serves both histories like their config/ siblings: identity, max-age=300', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    for (const obj of writtenObjects()) {
      expect(readMeta(obj), obj).toContain('cache-control=public, max-age=300')
      expect(readMeta(obj), obj).not.toContain('no-transform')
    }
    expect(writtenObjects()).toHaveLength(
      6 + 1 + survivalObjects().length + 1 + 1
    )
    expect(survivalObjects().length).toBeGreaterThan(0)
  })

  it('uploads the shards before the index that names them', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const uploads = lines(shimLog).filter(l =>
      new RegExp(`^storage cp .*gs://${BUCKET}/${PREFIX}$`).test(l)
    )
    expect(uploads).toHaveLength(2)
    expect(uploads[0]).toMatch(/\/77\.json /)
    expect(uploads[0]).not.toMatch(/index\.json/)
    expect(uploads[1]).toMatch(/\/index\.json /)
  })

  it('prints one JSON summary line on stdout (R4) and reports gzip sizes', () => {
    seedAll()
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
    seedRankings()
    const r = runScript()
    expect(r.status).toBe(1)
    expect(writtenObjects()).toEqual([])
  })

  it('writes nothing outside the two histories and the closed-club names', () => {
    seedAll()
    const before = allObjects().filter(o => !writtenObjects().includes(o))
    expect(runScript().status).toBe(0)
    expect(allObjects().filter(o => !writtenObjects().includes(o))).toEqual(
      before
    )
    const writes = lines(shimLog).filter(
      l => /^storage (cp|rsync)/.test(l) && /\sgs:\/\/\S+$/.test(l)
    )
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      const dest = w.split(' ').at(-1) ?? ''
      expect(
        dest === `gs://${BUCKET}/${PREFIX}` ||
          dest === `gs://${BUCKET}/${SURVIVAL}` ||
          dest === `gs://${BUCKET}/${REGION}` ||
          dest === `gs://${BUCKET}/${CLOSED}`,
        w
      ).toBe(true)
    }
    expect(derivedObjects()).toEqual([])
  })

  it('records every object it writes in the run manifest, with the sha256 of its bytes (#1762, ADR-015 P5)', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const recorded = lines(manifest).map(
      l => JSON.parse(l) as { path: string; sha256: string; stage: string }
    )
    expect(recorded.map(e => e.path).sort()).toEqual(writtenObjects())
    expect(recorded.map(e => e.path)).toContain(REGION)
    for (const e of recorded) {
      expect(e.stage).toBe('identity')
      const bytes = fs.readFileSync(path.join(root, BUCKET, e.path))
      expect(e.sha256, e.path).toBe(
        createHash('sha256').update(bytes).digest('hex')
      )
    }
  })
})

describe('build-identity-history.sh: charter cohort survival to config/ (#2061)', () => {
  it('uploads one schema-valid file for every district the history names', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const named = new Set<string>()
    for (const shard of allObjects().filter(o =>
      /club-district-history\/\d{2}\.json$/.test(o)
    )) {
      const parsed = ClubDistrictHistoryShardSchema.parse(readObject(shard))
      for (const club of Object.values(parsed.clubs)) {
        for (const d of Object.values(club.byProgramYear)) named.add(d)
      }
    }
    expect(districtSurvivalObjects()).toEqual(
      [...named].map(d => `${SURVIVAL}district_${d}.json`).sort()
    )
    const d61 = CharterCohortSurvivalFileSchema.parse(
      readObject(`${SURVIVAL}district_61.json`)
    )
    expect(d61.districtId).toBe('61')
    expect(d61.asOf).toBe(
      ClubDistrictHistoryIndexSchema.parse(readObject(`${PREFIX}index.json`))
        .asOf
    )
  })

  it('serves them like the history: plain JSON, identity, max-age=300', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const meta = readMeta(`${SURVIVAL}district_61.json`)
    expect(meta).not.toContain('content-encoding=gzip')
    expect(meta).toContain('content-type=application/json')
    expect(meta).toContain('cache-control=public, max-age=300')
  })

  it('uploads them after the history index, in one transfer', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const cps = lines(shimLog).filter(l => /^storage cp /.test(l))
    const index = cps.findIndex(l => /\/index\.json gs:/.test(l))
    const survival = cps.findIndex(l =>
      l.endsWith(`gs://${BUCKET}/${SURVIVAL}`)
    )
    expect(index).toBeGreaterThanOrEqual(0)
    expect(survival).toBeGreaterThan(index)
    expect(
      cps.filter(l => l.endsWith(`gs://${BUCKET}/${SURVIVAL}`))
    ).toHaveLength(1)
  })

  it('reports their count and sizes in the summary line and the step summary', () => {
    seedAll()
    const r = runScript()
    const parsed = JSON.parse(r.stdout.trim())
    expect(parsed.charterCohortSurvival.districts).toBe(
      districtSurvivalObjects().length
    )
    expect(parsed.charterCohortSurvival.gzipBytes).toBeGreaterThan(0)
    expect(parsed.charterCohortSurvival.maxGzipBytes).toBeGreaterThan(0)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /charter cohort survival.*districts/i
    )
  })

  it('is a global promotion object with its own content-gate kind', () => {
    const p = `${SURVIVAL}district_61.json`
    expect(PROMOTED_PREFIXES.some(x => p.startsWith(x))).toBe(true)
    expect(classifyPromotionPath(p)).toEqual({ kind: 'global' })
    expect(classifyObject(p)).toBe('charter-cohort-survival')
  })
})

describe('build-identity-history.sh: region and world cohort survival (#1818)', () => {
  it('uploads one schema-valid file per region the region history names, and one for the world', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const regions = DistrictRegionHistorySchema.parse(readObject(REGION))
    const named = new Set<string>()
    for (const d of Object.values(regions.districts)) {
      for (const id of Object.values(d.byProgramYear)) named.add(id)
    }
    expect(named.size).toBeGreaterThan(0)
    expect(
      survivalObjects().filter(o => !o.startsWith(`${SURVIVAL}district_`))
    ).toEqual(
      [
        ...[...named].map(id => `${SURVIVAL}region_${id}.json`),
        `${SURVIVAL}world.json`,
      ].sort()
    )
    const world = CharterCohortSurvivalRollupFileSchema.parse(
      readObject(`${SURVIVAL}world.json`)
    )
    expect(world.scope).toEqual({ kind: 'world' })
    expect(world.asOf).toBe(
      ClubDistrictHistoryIndexSchema.parse(readObject(`${PREFIX}index.json`))
        .asOf
    )
    const r05 = CharterCohortSurvivalRollupFileSchema.parse(
      readObject(`${SURVIVAL}region_05.json`)
    )
    expect(r05.scope).toEqual({ kind: 'region', regionId: '05' })
  })

  it('uploads them in the same one transfer as the district files, after the index', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const cps = lines(shimLog).filter(l =>
      l.endsWith(`gs://${BUCKET}/${SURVIVAL}`)
    )
    expect(cps).toHaveLength(1)
    expect(cps[0]).toMatch(/world\.json /)
    expect(cps[0]).toMatch(/region_05\.json /)
    expect(readMeta(`${SURVIVAL}world.json`)).toContain(
      'cache-control=public, max-age=300'
    )
  })

  it('reports their count and sizes in the summary line and the step summary', () => {
    seedAll()
    const r = runScript()
    const parsed = JSON.parse(r.stdout.trim())
    expect(parsed.charterCohortSurvivalRollups.regions).toBe(
      survivalObjects().filter(o => o.startsWith(`${SURVIVAL}region_`)).length
    )
    expect(parsed.charterCohortSurvivalRollups.gzipBytes).toBeGreaterThan(0)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /region and world cohort survival.*regions/i
    )
  })

  it('are global promotion objects with their own content-gate kind', () => {
    for (const p of [`${SURVIVAL}region_05.json`, `${SURVIVAL}world.json`]) {
      expect(PROMOTED_PREFIXES.some(x => p.startsWith(x))).toBe(true)
      expect(classifyPromotionPath(p)).toEqual({ kind: 'global' })
      expect(classifyObject(p)).toBe('charter-cohort-survival-rollup')
    }
  })
})

describe('build-identity-history.sh: closed-club name index (#2062)', () => {
  it('uploads a schema-valid index of the closed clubs only', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const closed = ClosedClubNameIndexSchema.parse(readObject(CLOSED))
    expect(closed.totalClubs).toBe(2)
    expect(closed.asOf).toBe('2026-10-10')
    const ids = Object.values(closed.programYears)
      .flatMap(d => Object.values(d))
      .flat()
      .map(row => row[0])
      .sort()
    expect(ids).toEqual(['368', '699'])
  })

  it('reports its count and measured sizes in the summary line', () => {
    seedAll()
    const r = runScript()
    const parsed = JSON.parse(r.stdout.trim())
    expect(parsed.closedClubNames).toMatchObject({ clubs: 2 })
    expect(parsed.closedClubNames.gzipBytes).toBeGreaterThan(0)
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /closed-club names.*2 clubs/i
    )
  })
})

describe('build-identity-history.sh: district → region history (#1820)', () => {
  it('uploads a schema-valid region history from the staged rankings', () => {
    seedAll()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    const history = DistrictRegionHistorySchema.parse(readObject(REGION))
    expect(history.asOf).toBe('2026-10-10')
    expect(history.districts['61']?.spans).toEqual([
      { from: '2017-06-30', to: '2017-06-30', region: '06' },
      { from: '2025-06-30', to: null, region: '05' },
    ])
    expect(history.districts['01']?.spans.at(-1)?.to).toBe('2026-06-30')
    expect(JSON.parse(r.stdout.trim()).districtRegionHistory).toMatchObject({
      districts: 5,
      conflicts: 0,
    })
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(
      /district.region history.*5 districts/i
    )
  })

  it('reads only the first and last snapshot of each program year', () => {
    // 2026-09-30 sits inside 2026-27, between its first (07-26) and last
    // (10-10) dates: listed, never downloaded.
    seedClubRace()
    seedRankings({ '2026-09-30': '2026-10-10' })
    expect(runScript().status).toBe(0)
    const reads = lines(shimLog).filter(l =>
      /^storage cp gs:\/\/\S+\/snapshots\//.test(l)
    )
    expect(reads.map(l => /snapshots\/([\d-]+)\//.exec(l)?.[1])).toEqual([
      '2017-06-30',
      '2025-06-30',
      '2026-06-30',
      '2026-07-26',
      '2026-10-10',
    ])
  })

  it('reads gzip-stored rankings under gcloud 568 too (bytes as stored)', () => {
    seedAll()
    const r = runScript({ SHIM_DOWNLOAD_DECOMPRESS: '0' })
    expect(r.status, r.stderr).toBe(0)
    expect(
      DistrictRegionHistorySchema.parse(readObject(REGION)).districts['201']
    ).toBeDefined()
  })

  it('fails (exit 1) without uploading a region history when no rankings are staged', () => {
    seedClubRace()
    const r = runScript()
    expect(r.status).toBe(1)
    expect(allObjects()).not.toContain(REGION)
  })
})

describe('both histories are promoted with the run (#1820, #1782)', () => {
  it('is under a promoted prefix, a global object for scoped promotion', () => {
    expect(PROMOTED_PREFIXES.some(p => REGION.startsWith(p))).toBe(true)
    expect(classifyPromotionPath(REGION)).toEqual({ kind: 'global' })
  })

  it('the content gate schema-checks it (its own kind, not the generic sample)', () => {
    expect(classifyObject(REGION)).toBe('district-region-history')
  })

  it('the closed-club name index is a global object with its own gate kind (#2062)', () => {
    expect(PROMOTED_PREFIXES.some(p => CLOSED.startsWith(p))).toBe(true)
    expect(classifyPromotionPath(CLOSED)).toEqual({ kind: 'global' })
    expect(classifyObject(CLOSED)).toBe('closed-club-name-index')
  })

  it('the club history shards and index are global objects with their own gate kinds', () => {
    for (const p of [`${PREFIX}77.json`, `${PREFIX}index.json`]) {
      expect(
        PROMOTED_PREFIXES.some(x => p.startsWith(x)),
        p
      ).toBe(true)
      expect(classifyPromotionPath(p), p).toEqual({ kind: 'global' })
    }
    expect(classifyObject(`${PREFIX}77.json`)).toBe(
      'club-district-history-shard'
    )
    expect(classifyObject(`${PREFIX}index.json`)).toBe(
      'club-district-history-index'
    )
  })
})

describe('the script writes only to the bucket it is given', () => {
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
      s => s.name === 'Promote run manifest to production (#1763)'
    )
    expect(promote, 'no promote step').toBeDefined()
    expect(promote!.run ?? '').not.toContain('derived')
    expect(classifyPromotionPath('derived/x/y.json').kind).toBe('excluded')
    // The education rollup is promotable only by the report-sidecar
    // promotion (#2222); the pipeline's own plan excludes it.
    const plan = planManifestPromotion({
      entries: [
        {
          path: 'derived/education-rollup/index.json',
          sha256: 'a'.repeat(64),
          date: null,
          stage: 'rebuild',
        },
      ],
      held: { all: false, dates: [] },
      indexDates: null,
      prodDates: null,
    })
    expect(plan.objectCount).toBe(0)
    expect(plan.excluded.map(e => e.path)).toEqual([
      'derived/education-rollup/index.json',
    ])
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

  // Since #1765 daily runs process-dates.sh, which builds the histories
  // after its loop, non-fatally, and in daily only when the date published
  // (processDates.test.ts, "process-dates.sh daily").
  it('daily builds it through the runner, never inline', () => {
    const daily = steps.filter(s => modeOf(s.name) === 'daily')
    expect(
      daily.filter(s =>
        (s.run ?? '').includes(
          'scripts/pipeline/process-dates.sh "${GCS_BUCKET}" daily'
        )
      )
    ).toHaveLength(1)
    expect(
      daily.some(s => /build-identity-history\.sh/.test(s.run ?? ''))
    ).toBe(false)
  })
})
