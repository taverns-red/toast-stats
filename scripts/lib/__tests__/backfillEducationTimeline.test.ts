/**
 * scripts/pipeline/backfill-education-timeline.sh (#2591, epic #2590): the
 * one-off build of a program year's education timeline from staging's
 * per-date `district_<id>_reports.json`, and its prior-year ghost.
 *
 * Run here against the gcloud shim (D10), never a real bucket. By default it
 * builds locally and WRITES NOTHING to the bucket; `--upload` adds the PY's
 * entity files, `derived/education-timeline/<PY>/{world,region-<n>,
 * district-<id>}.json`, recorded in the run manifest.
 * The ghost is the prior year's own timeline if staging has it, else the
 * prior year's per-date reports, else the ledger history (month grain), else
 * none.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  DistrictReportsDatasetSchema,
  EducationTimelineEntitySchema,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'
import { joinTimeline, type EducationTimeline } from '../educationTimeline.js'

const REPO = process.cwd()
const SCRIPT = path.join(
  REPO,
  'scripts/pipeline/backfill-education-timeline.sh'
)
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const FIX = path.join(REPO, 'scripts/lib/__tests__/fixtures/education-rollup')
const BUCKET = 'test-bucket'
const TL = 'derived/education-timeline/'

let tmp: string
let root: string
let out: string
let manifest: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-timeline-'))
  root = path.join(tmp, 'gcs')
  out = path.join(tmp, 'out')
  manifest = path.join(tmp, 'written.jsonl')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function run(args: string[], extra: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, BUCKET, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      RAW_SOURCE_BUCKET: BUCKET,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      CACHE_DIR: path.join(tmp, 'cache'),
      RUN_MANIFEST_FILE: manifest,
      GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
      OUT_DIR: out,
      ...extra,
    },
  })
}

function put(objectPath: string, body: Buffer | string, gzip = false): void {
  const dest = path.join(root, BUCKET, objectPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(
    dest,
    gzip
      ? zlib.gzipSync(typeof body === 'string' ? Buffer.from(body) : body)
      : body
  )
  const meta = path.join(root, '.meta', BUCKET, objectPath)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `${gzip ? 'content-encoding=gzip\n' : ''}content-type=application/json\n`
  )
}
const fixture = (rel: string) => fs.readFileSync(path.join(FIX, rel))

const d49 = DistrictReportsDatasetSchema.parse(
  JSON.parse(
    fixture('snapshots/2026-10-12/district_49_reports.json').toString()
  )
)
/** Stage one reports dataset (D49, first n records) at a date, as staged (-Z). */
function stage(date: string, n: number, programYear = '2026-2027'): void {
  const ach = d49.sections.educationAchievements
  put(
    `snapshots/${date}/district_49_reports.json`,
    JSON.stringify({
      ...d49,
      programYear,
      sections: {
        ...d49.sections,
        educationAchievements: ach && {
          ...ach,
          records: ach.records.slice(0, n),
        },
      },
    }),
    true
  )
  put(
    `snapshots/${date}/all-districts-rankings.json`,
    fixture('snapshots/2026-10-12/all-districts-rankings.json'),
    true
  )
}
function seedCommon(): void {
  put(
    'config/district-region-history.json',
    fixture('config/district-region-history.json')
  )
}
/** The PY's entity files the script wrote, validated, joined. */
const readOut = (py: string): EducationTimeline => {
  const files = new Map<string, EducationTimelineEntity>()
  for (const f of fs.readdirSync(path.join(out, py))) {
    files.set(
      f,
      EducationTimelineEntitySchema.parse(
        JSON.parse(fs.readFileSync(path.join(out, py, f), 'utf-8'))
      )
    )
  }
  const t = joinTimeline(files)
  if (!t) throw new Error('no world.json')
  return t
}
const bucketObjects = () =>
  fs
    .readdirSync(path.join(root, BUCKET), {
      recursive: true,
      withFileTypes: true,
    })
    .filter(e => e.isFile())
    .map(e =>
      path.relative(path.join(root, BUCKET), path.join(e.parentPath, e.name))
    )
    .sort()

describe('backfill-education-timeline.sh', () => {
  it('builds the program year from its per-date reports, and writes nothing to the bucket', () => {
    seedCommon()
    stage('2026-10-10', 20)
    stage('2026-10-11', 50)
    stage('2026-10-12', 81)
    // Another program year's date is never folded in.
    stage('2026-06-30', 81, '2025-2026')
    const before = bucketObjects()
    const r = run(['2026-2027'])
    expect(r.status, r.stderr).toBe(0)
    const t = readOut('2026-2027')
    expect(t.dates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12'])
    // The other program year's date is its ghost, not a point.
    expect(t.prior?.world.map(p => p.at)).toEqual(['2026-06-30'])
    expect(bucketObjects()).toEqual(before)
    expect(fs.existsSync(manifest)).toBe(false)
  })

  it('no prior-year source at all: the ghost is null, with a warning', () => {
    seedCommon()
    stage('2026-10-12', 81)
    const r = run(['2026-2027'])
    expect(r.status, r.stderr).toBe(0)
    expect(readOut('2026-2027').prior).toBeNull()
    expect(r.stderr).toMatch(/no prior-year source/)
  })

  it('a date with no reports is absent, never zero', () => {
    seedCommon()
    stage('2026-10-10', 20)
    put(
      'snapshots/2026-10-11/all-districts-rankings.json',
      fixture('snapshots/2026-10-12/all-districts-rankings.json'),
      true
    )
    stage('2026-10-12', 81)
    expect(run(['2026-2027']).status).toBe(0)
    expect(readOut('2026-2027').dates).toEqual(['2026-10-10', '2026-10-12'])
  })

  it('with --upload: the entity files under derived/education-timeline/<PY>/, recorded in the manifest', () => {
    seedCommon()
    stage('2026-10-12', 81)
    const before = bucketObjects()
    const r = run(['2026-2027', '--upload'])
    expect(r.status, r.stderr).toBe(0)
    const want = [
      `${TL}2026-2027/district-49.json`,
      `${TL}2026-2027/region-01.json`,
      `${TL}2026-2027/world.json`,
    ]
    expect(bucketObjects().filter(o => !before.includes(o))).toEqual(want)
    const rows = fs
      .readFileSync(manifest, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { path: string; stage: string })
    expect(rows.map(x => x.path).sort()).toEqual(want)
    expect(rows.every(x => x.stage === 'education-rollup')).toBe(true)
    for (const o of want) {
      expect(
        EducationTimelineEntitySchema.safeParse(
          JSON.parse(fs.readFileSync(path.join(root, BUCKET, o), 'utf-8'))
        ).success,
        o
      ).toBe(true)
    }
    expect(JSON.parse(r.stdout.trim())).toMatchObject({
      uploaded: true,
      files: 3,
    })
  })

  it('ghost: the prior year timeline in staging, when there is one (day grain)', () => {
    seedCommon()
    stage('2026-10-12', 81)
    stage('2025-10-12', 40, '2025-2026')
    expect(run(['2025-2026', '--upload']).status).toBe(0)
    const r = run(['2026-2027'])
    expect(r.status, r.stderr).toBe(0)
    expect(readOut('2026-2027').prior).toMatchObject({
      programYear: '2025-2026',
      source: 'timeline',
      grain: 'day',
    })
  })

  it('ghost: the prior year per-date reports when it has no timeline yet (day grain)', () => {
    seedCommon()
    stage('2026-10-12', 81)
    stage('2025-10-11', 30, '2025-2026')
    stage('2025-10-12', 40, '2025-2026')
    const r = run(['2026-2027'])
    expect(r.status, r.stderr).toBe(0)
    const prior = readOut('2026-2027').prior
    expect(prior).toMatchObject({ source: 'timeline', grain: 'day' })
    expect(prior?.world.map(p => p.at)).toEqual(['2025-10-11', '2025-10-12'])
  })

  it('ghost: the ledger history, month grain, when no prior reports exist', () => {
    seedCommon()
    // PY 2019-20 has the recorded archive backfill; 2018-19 only the ledger.
    put(
      'snapshots/2020-06-30/district_111_reports.json',
      fixture('snapshots/2020-06-30/district_111_reports.json'),
      true
    )
    put(
      'snapshots/2020-06-30/all-districts-rankings.json',
      fixture('snapshots/2020-06-30/all-districts-rankings.json'),
      true
    )
    put(
      'raw-education-ledger/2018-2019/district_111.json',
      fixture('raw-education-ledger/2018-2019/district_111.json')
    )
    const r = run(['2019-2020'])
    expect(r.status, r.stderr).toBe(0)
    const t = readOut('2019-2020')
    expect(t.dates).toEqual(['2020-06-30'])
    expect(t.prior).toMatchObject({
      programYear: '2018-2019',
      source: 'ledger-history',
      grain: 'month',
    })
  })

  it('fails closed on a listing error, writing nothing', () => {
    seedCommon()
    stage('2026-10-12', 81)
    const r = run(['2026-2027', '--upload'], {
      SHIM_FAIL_MATCH: '^ls .*snapshots',
    })
    expect(r.status).toBe(1)
    expect(fs.existsSync(path.join(out, '2026-2027'))).toBe(false)
    expect(bucketObjects().some(o => o.startsWith(TL))).toBe(false)
  })

  it('usage: a bucket and a program year (exit 2)', () => {
    expect(spawnSync('bash', [SCRIPT], { cwd: REPO }).status).toBe(2)
    expect(run(['not-a-year']).status).toBe(2)
  })
})
