/**
 * snapshots/<date>/reports-rollups.json in the pipeline (#2012).
 *
 * scripts/pipeline/build-reports-rollups.sh reads ONE date's placed sidecars
 * (`snapshots/<date>/district_*_reports.json`), that date's rankings and
 * config/district-region-history.json from STAGING, folds them
 * (scripts/lib/reportsRollups.ts) and uploads the artifact beside the
 * sidecars, recorded in the run manifest. The contracts pinned here:
 *   1. run for real against the gcloud shim (D10) on the recorded prod
 *      capture, it writes one schema-valid object, -Z with the snapshot
 *      headers, at snapshots/<date>/ only, recorded with its sha256;
 *   2. a date with no sidecars writes nothing; a missing district or region
 *      history degrades; a listing error fails closed;
 *   3. the content gate gives it its own kind, always checked: schema, date,
 *      program year, world = Σ districts, region = Σ its districts, and the
 *      null rule;
 *   4. no prod write: it is promoted with its date, by promotion only;
 *   5. daily runs it in the `education-rollup` job, after place-reports,
 *      non-fatally, before that job republishes the run manifest;
 *   6. rebuild runs it per published date inside process-dates.sh (#2202),
 *      in the stream step, before the pipeline job publishes its manifest,
 *      so the backfill goes through the gates and promotion with its date.
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
  ReportsRollupsSchema,
  type ReportsRollups,
} from '@taverns-red/shared-contracts'
import { classifyPromotionPath } from '../manifestPromotion.js'
import {
  findProdWriteSteps,
  prodWriteReasons,
  SKIP_CLAUSE_DOWNSTREAM,
  topLevelConjuncts,
  type Workflow,
  type WorkflowStep,
} from '../prodWriteGuard.js'
import {
  checkObject,
  classifyObject,
  planContentChecks,
  PROMOTED_PREFIXES,
  type CheckContext,
  type StoredObject,
} from '../promotionContentGate.js'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/build-reports-rollups.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const FIX = path.join(REPO, 'scripts/lib/__tests__/fixtures/reports-rollups')
const SAMPLE = path.join(
  REPO,
  'packages/shared-contracts/src/__tests__/__fixtures__/recorded-reports-rollups.json'
)
const BUCKET = 'test-bucket'
const DATE = '2026-10-15'
const OBJECT = `snapshots/${DATE}/reports-rollups.json`

let tmp: string
let root: string
let shimLog: string
let summary: string
let manifest: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reports-rollups-'))
  root = path.join(tmp, 'gcs')
  shimLog = path.join(tmp, 'gcloud.log')
  summary = path.join(tmp, 'summary.md')
  manifest = path.join(tmp, 'written.jsonl')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function runScript(
  args: string[] = [BUCKET, DATE],
  extra: Record<string, string> = {}
) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      SHIM_LOG: shimLog,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      GITHUB_STEP_SUMMARY: summary,
      RUN_MANIFEST_FILE: manifest,
      ...extra,
    },
  })
}

/** Stage one object; `gzip` = as the pipeline stages it (-Z). */
function putBytes(objectPath: string, bytes: Buffer, gzip: boolean): void {
  const dest = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, gzip ? zlib.gzipSync(bytes) : bytes)
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `${gzip ? 'content-encoding=gzip\n' : ''}content-type=application/json\n`
  )
}
const put = (objectPath: string, from: string, gzip: boolean) =>
  putBytes(objectPath, fs.readFileSync(path.join(FIX, from)), gzip)

/** The recorded capture at its staging paths, encoded as staging has it. */
function seedAll(): void {
  for (const f of ['district_61_reports.json', 'all-districts-rankings.json']) {
    put(`snapshots/${DATE}/${f}`, `snapshots/${DATE}/${f}`, true)
  }
  put(
    'config/district-region-history.json',
    'config/district-region-history.json',
    false
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

/** The uploaded object, one Content-Encoding layer peeled. */
function readArtifact(): ReportsRollups {
  const bytes = fs.readFileSync(path.join(root, BUCKET, OBJECT))
  return ReportsRollupsSchema.parse(
    JSON.parse(zlib.gunzipSync(bytes).toString('utf-8'))
  )
}

function lines(file: string): string[] {
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
}

describe('build-reports-rollups.sh: snapshots/<date>/reports-rollups.json', () => {
  it('uploads one schema-valid object beside the sidecars', () => {
    seedAll()
    const before = allObjects()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(allObjects()).toEqual([...before, OBJECT].sort())
    const out = readArtifact()
    expect(out.snapshotDate).toBe(DATE)
    expect(out.world.octoberDues?.verified).toBe(138)
  })

  it('stores it -Z with the snapshot headers', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const meta = fs.readFileSync(
      path.join(root, '.meta', BUCKET, OBJECT),
      'utf-8'
    )
    expect(meta).toContain('content-encoding=gzip')
    expect(meta).toContain('content-type=application/json')
    expect(meta).toContain(
      'cache-control=public, max-age=3600, must-revalidate'
    )
  })

  it('records it in the run manifest with the sha256 of its served bytes', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const recorded = lines(manifest).map(
      l =>
        JSON.parse(l) as {
          path: string
          sha256: string
          stage: string
          date: string
        }
    )
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      path: OBJECT,
      stage: 'reports-rollups',
      date: DATE,
    })
    const served = zlib.gunzipSync(
      fs.readFileSync(path.join(root, BUCKET, OBJECT))
    )
    expect(recorded[0]?.sha256).toBe(
      createHash('sha256').update(served).digest('hex')
    )
  })

  it('reads only the one date: its sidecars, its rankings, the history', () => {
    seedAll()
    put(
      'snapshots/2026-10-14/district_61_reports.json',
      `snapshots/${DATE}/district_61_reports.json`,
      true
    )
    expect(runScript().status).toBe(0)
    const reads = lines(shimLog).filter(l => /^storage cp gs:\/\//.test(l))
    expect(reads.join('\n')).not.toContain('2026-10-14')
    expect(reads).toHaveLength(3)
  })

  it('a date with no sidecars writes nothing and is not an error', () => {
    seedAll()
    fs.rmSync(
      path.join(root, BUCKET, `snapshots/${DATE}/district_61_reports.json`)
    )
    const before = allObjects()
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::notice::.*no district_\*_reports\.json/)
    expect(allObjects()).toEqual(before)
    expect(lines(manifest)).toEqual([])
  })

  it('a district on the rankings without a sidecar: null above it, still written', () => {
    seedAll()
    const rankings = JSON.parse(
      fs.readFileSync(
        path.join(FIX, `snapshots/${DATE}/all-districts-rankings.json`),
        'utf-8'
      )
    ) as { rankings: { districtId: string; region: string }[] }
    rankings.rankings.push({ ...rankings.rankings[0]!, districtId: '86' })
    putBytes(
      `snapshots/${DATE}/all-districts-rankings.json`,
      Buffer.from(JSON.stringify(rankings)),
      true
    )
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::warning::.*1 of 2 districts/)
    const out = readArtifact()
    expect(out.world.octoberDues).toBeNull()
    expect(out.regions?.['05']?.districtsWithoutReports).toEqual(['86'])
  })

  it('without a region history: regions null, districts and world still built', () => {
    seedAll()
    fs.rmSync(path.join(root, BUCKET, 'config/district-region-history.json'))
    const r = runScript()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/::warning::.*district-region-history/)
    const out = readArtifact()
    expect(out.regions).toBeNull()
    expect(out.world.octoberDues?.clubs).toBe(161)
  })

  it('reads gzip-stored inputs under gcloud 568 too (bytes as stored)', () => {
    seedAll()
    const r = runScript([BUCKET, DATE], { SHIM_DOWNLOAD_DECOMPRESS: '0' })
    expect(r.status, r.stderr).toBe(0)
    expect(readArtifact().world.officerList?.submitted).toBe(158)
  })

  it('a listing error fails closed (exit 1) with nothing uploaded', () => {
    seedAll()
    const before = allObjects()
    const r = runScript([BUCKET, DATE], { SHIM_FAIL_MATCH: '^ls ' })
    expect(r.status).toBe(1)
    expect(allObjects()).toEqual(before)
  })

  it('prints one JSON summary line on stdout (R4)', () => {
    seedAll()
    const r = runScript()
    const out = r.stdout.trim().split('\n')
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0]!)).toMatchObject({
      snapshotDate: DATE,
      districts: 1,
      sidecars: 1,
    })
    expect(fs.readFileSync(summary, 'utf-8')).toMatch(/reports rollups/i)
  })

  it('usage: a bucket and a YYYY-MM-DD date (exit 2)', () => {
    expect(runScript([BUCKET]).status).toBe(2)
    expect(runScript([BUCKET, '2026-10']).status).toBe(2)
  })

  it('the recorded consumer fixture is what the script builds', () => {
    seedAll()
    expect(runScript().status).toBe(0)
    const built = readArtifact()
    if (process.env['UPDATE_REPORTS_ROLLUPS_SAMPLE'] === '1') {
      fs.writeFileSync(SAMPLE, `${JSON.stringify(built, null, 2)}\n`)
    }
    const sample = JSON.parse(
      fs.readFileSync(SAMPLE, 'utf-8')
    ) as ReportsRollups
    expect({ ...built, generatedAt: sample.generatedAt }).toEqual(sample)
  })
})

describe('promotion: no prod write; it moves with its date', () => {
  it('the script makes no prod write (the #1755 prod-write guard)', () => {
    const text = fs.readFileSync(SCRIPT, 'utf-8')
    expect(prodWriteReasons(text)).toEqual([])
    expect(text).not.toMatch(/GCS_BUCKET_PRODUCTION|toast-stats-data-ca/)
  })

  it('is under a promoted prefix, a date object for scoped promotion', () => {
    expect(PROMOTED_PREFIXES.some(p => OBJECT.startsWith(p))).toBe(true)
    expect(classifyPromotionPath(OBJECT)).toEqual({ kind: 'date', date: DATE })
  })
})

describe('content gate: reports-rollups (#2012)', () => {
  const RECORDED = JSON.parse(
    fs.readFileSync(SAMPLE, 'utf-8')
  ) as ReportsRollups
  const CTX: CheckContext = {
    latestSnapshotDate: DATE,
    availableDates: [DATE],
    clubHistoryShards: { staging: [], prod: [] },
  }
  const plain = (value: unknown): StoredObject => ({
    bytes: new TextEncoder().encode(JSON.stringify(value)),
  })
  const check = (p: string, value: unknown) =>
    checkObject({ path: p, kind: classifyObject(p)! }, plain(value), null, CTX)

  /** The recorded date with a second, region-05 district. */
  function twoDistricts(): ReportsRollups {
    const r = structuredClone(RECORDED)
    const d61 = r.districts['61']!
    r.districts['86'] = structuredClone(d61)
    r.regions!['05']!.districtIds = ['61', '86']
    r.world.districts = 2
    const double = (o: Record<string, unknown> | null) => {
      if (!o) return
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'number') o[k] = v * 2
      }
    }
    for (const block of [r.world, r.regions!['05']!]) {
      double(block.coached)
      double(block.octoberDues)
      double(block.aprilDues)
      double(block.officerList)
      double(block.sponsorsMentors)
      double(block.prospective as unknown as Record<string, unknown>)
      for (const s of block.prospective?.byStage ?? []) s.clubs *= 2
    }
    return r
  }

  it('is its own kind', () => {
    expect(classifyObject(OBJECT)).toBe('reports-rollups')
    expect(classifyObject('config/reports-rollups.json')).toBe('json')
  })

  it('is always checked, never sampled out', () => {
    const meta = (name: string) => ({ name, size: 1 })
    const plan = planContentChecks(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          meta(`snapshots/${DATE}/district_${i + 100}_reports.json`)
        ),
        meta(OBJECT),
      ],
      { random: () => 0, caps: { generic: 0 } }
    )
    expect(plan.checks.map(c => c.path)).toEqual([OBJECT])
  })

  it('passes the recorded artifact, and a consistent two-district one', () => {
    expect(check(OBJECT, RECORDED)).toBeNull()
    expect(check(OBJECT, twoDistricts())).toBeNull()
  })

  it('fails an artifact that breaks the shared-contracts schema', () => {
    expect(check(OBJECT, { ...RECORDED, world: { districts: 1 } })).toMatch(
      /schema/
    )
  })

  it('fails an artifact served under another date', () => {
    expect(
      check('snapshots/2026-10-16/reports-rollups.json', RECORDED)
    ).toMatch(/2026-10-16/)
  })

  it('fails a program year that is not the logical date’s', () => {
    expect(check(OBJECT, { ...RECORDED, programYear: '2025-2026' })).toMatch(
      /2026-2027/
    )
  })

  it('fails a world block that is not the sum of its districts', () => {
    const bad = twoDistricts()
    bad.world.officerList!.submitted += 1
    expect(check(OBJECT, bad)).toMatch(/world.*officerList/)
  })

  it('fails a block that reads a number where one of its districts is null', () => {
    const bad = twoDistricts()
    bad.districts['86']!.coached = null
    bad.districts['86']!.reports = 'available'
    bad.regions!['05']!.coached = null
    // world still claims a total over a district that has none
    expect(check(OBJECT, bad)).toMatch(/world.*coached/)
  })

  it('fails a region that lists a district not placed in it', () => {
    const bad = twoDistricts()
    bad.districts['86']!.region = '06'
    expect(check(OBJECT, bad)).toMatch(/region 05/)
  })

  it('fails a district listed without reports that still has figures', () => {
    const bad = structuredClone(RECORDED)
    bad.districts['61']!.reports = 'no-file'
    expect(check(OBJECT, bad)).toMatch(/61/)
  })
})

describe('daily: built after place-reports, in the education-rollup job', () => {
  interface JobStep {
    name?: string
    if?: string
    run?: string
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
  const CALL =
    'bash scripts/pipeline/build-reports-rollups.sh "${GCS_BUCKET}" "${{ needs.pipeline.outputs.snapshot_date }}"'
  const MANIFEST = '"gs://${GCS_BUCKET}/runs/${GITHUB_RUN_ID}/written.jsonl"'
  const LOCAL = '"${RUN_MANIFEST_FILE}"'
  const job = wf.jobs['education-rollup']
  const steps = job?.steps ?? []
  const flat = (s: JobStep) => (s.run ?? '').replace(/\\\r?\n\s*/g, ' ')
  const at = (pred: (s: JobStep) => boolean) => steps.findIndex(pred)
  const build = at(s => (s.run ?? '').includes(CALL))

  it('only that job calls it', () => {
    const callers = Object.entries(wf.jobs)
      .filter(([, j]) =>
        (j.steps ?? []).some(s =>
          (s.run ?? '').includes('build-reports-rollups.sh')
        )
      )
      .map(([id]) => id)
    expect(callers).toEqual(['education-rollup'])
    expect(([] as string[]).concat(job?.needs ?? [])).toContain('place-reports')
  })

  it('calls it non-fatally for the snapshot date', () => {
    expect(build, 'job does not call the script').toBeGreaterThanOrEqual(0)
    const run = steps[build]?.run ?? ''
    expect(run.slice(run.indexOf(CALL))).toMatch(/\|\|\s*echo "::warning::/)
  })

  it('between the manifest fetch and its republish', () => {
    const seed = at(s => flat(s).includes(`${MANIFEST} ${LOCAL}`))
    const publish = at(s => flat(s).includes(`${LOCAL} ${MANIFEST}`))
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(build)
    expect(publish).toBeGreaterThan(build)
  })
})

describe('daily: promoted with the sidecars, never mirrored (#1767)', () => {
  // The job runs after the run's own promotion. Until #1767 it mirrored the
  // file straight to prod, unchecked; now the build's manifest line goes to
  // the promote-reports job, which content-gates it (reports-rollups) and
  // promotes it through the manifest promoter with the sidecars.
  const workflow = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as Workflow & { jobs: Record<string, { needs?: string[] | string }> }
  const steps = workflow.jobs['education-rollup']?.steps ?? []

  it('the education-rollup job writes no reports rollup to prod', () => {
    expect(
      findProdWriteSteps(workflow)
        .filter(s => s.job === 'education-rollup')
        .map(s => s.step)
    ).toEqual([]) // nor the education rollup, since #2222
    expect(
      steps.some(s => /reports rollups into prod/.test(s.name ?? ''))
    ).toBe(false)
  })

  it('promote-reports runs after it, so the rollup is in the manifest it plans from', () => {
    expect(
      ([] as string[]).concat(workflow.jobs['promote-reports']?.needs ?? [])
    ).toContain('education-rollup')
  })
})

describe('rebuild: built per date inside the stream step, before the run manifest (#2202)', () => {
  interface Step {
    name?: string
    if?: string
    run?: string
  }
  const wf = parse(
    fs.readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as { jobs: Record<string, { if?: string; steps?: Step[] }> }
  const steps = wf.jobs['pipeline']?.steps ?? []
  const stream = steps.findIndex(s =>
    (s.run ?? '').includes(
      'bash scripts/pipeline/process-dates.sh "${GCS_BUCKET}" rebuild'
    )
  )
  const publish = steps.findIndex(
    s => s.name === 'Publish run manifest (#1762)'
  )
  const loop = fs.readFileSync(
    path.join(REPO, 'scripts/pipeline/process-dates.sh'),
    'utf-8'
  )

  it('process-dates.sh runs the builder in rebuild mode only, after the identity histories', () => {
    expect(loop).toMatch(
      /BUILD_REPORTS_ROLLUPS:-bash \$\{REPO\}\/scripts\/pipeline\/build-reports-rollups\.sh/
    )
    const call = loop.indexOf('"${ROLLUPS[@]}" "${BUCKET}"')
    expect(call, 'process-dates.sh does not call it').toBeGreaterThan(0)
    expect(loop.indexOf('"${IDENTITY[@]}" "${BUCKET}"')).toBeLessThan(call)
    expect(loop.slice(0, call)).toMatch(/if \[ "\$\{MODE\}" = "rebuild" \]/)
  })

  it('the rebuild stream step runs before the pipeline job publishes its manifest', () => {
    expect(stream).toBeGreaterThanOrEqual(0)
    expect(publish).toBeGreaterThan(stream)
    expect(steps[stream]?.if).toBe("steps.mode.outputs.mode == 'rebuild'")
  })

  it('the daily path is unchanged: the education-rollup job still builds the snapshot date', () => {
    expect(wf.jobs['education-rollup']?.if ?? '').toContain(
      "needs.pipeline.outputs.snapshot_date != ''"
    )
  })
})
