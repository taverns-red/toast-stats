/**
 * The education timeline backfill CLI (#2591, epic #2590).
 *
 * scripts/build-education-timeline.ts folds a program year's per-date
 * `district_<id>_reports.json` snapshots into the PY's entity files
 * (`derived/education-timeline/<PY>/{world,region-<n>,district-<id>}.json`),
 * one date at a time, and sets the prior-year ghost. It does no network
 * I/O: scripts/pipeline/backfill-education-timeline.sh feeds it batches of
 * dates from staging and uploads the result. Two commands, whose
 * --existing / --out / --prior-timeline are DIRECTORIES of entity files:
 *
 *   fold  --py --region-history --reports-root <dir/<date>/district_*_reports.json>
 *         [--existing <dir>] --out <dir>
 *   ghost --py --region-history --existing <dir> --out <dir>
 *         [--prior-timeline <dir> | --prior-ledger <dir of district_*.json>]
 *
 * Fixtures: the recorded D49 daily dataset and D111 2018-19 ledger
 * (fixtures/education-rollup/), as in educationTimeline.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { joinTimeline, type EducationTimeline } from '../educationTimeline.js'
import {
  DistrictReportsDatasetSchema,
  EducationTimelineEntitySchema,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'

const REPO = process.cwd()
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const CLI = path.join(REPO, 'scripts/build-education-timeline.ts')
const FIX = path.join(REPO, 'scripts/lib/__tests__/fixtures/education-rollup')
const PY = '2026-2027'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'education-timeline-cli-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const d49 = DistrictReportsDatasetSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(FIX, 'snapshots/2026-10-12/district_49_reports.json'),
      'utf-8'
    )
  )
)
const REGIONS = path.join(FIX, 'config/district-region-history.json')

/** <root>/<date>/district_<id>_reports.json with the first n records. */
function stage(
  root: string,
  date: string,
  id: string,
  n: number,
  gzip = false
): void {
  const ach = d49.sections.educationAchievements
  const y = Number(date.slice(0, 4))
  const programYear =
    Number(date.slice(5, 7)) >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
  const dataset = {
    ...d49,
    districtId: id,
    programYear,
    sections: {
      ...d49.sections,
      educationAchievements: ach && {
        ...ach,
        records: ach.records.slice(0, n),
      },
    },
  }
  const dir = path.join(root, date)
  fs.mkdirSync(dir, { recursive: true })
  const body = Buffer.from(JSON.stringify(dataset))
  fs.writeFileSync(
    path.join(dir, `district_${id}_reports.json`),
    gzip ? zlib.gzipSync(body) : body
  )
}

function cli(args: string[]) {
  return spawnSync(TSX, [CLI, ...args], { cwd: REPO, encoding: 'utf-8' })
}
/** The entity files in a directory, each validated, joined into one timeline. */
const readTimeline = (dir: string): EducationTimeline => {
  const files = new Map<string, EducationTimelineEntity>()
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    files.set(
      f,
      EducationTimelineEntitySchema.parse(
        JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      )
    )
  }
  const t = joinTimeline(files)
  if (!t) throw new Error(`no world.json in ${dir}`)
  return t
}

describe('fold', () => {
  it('folds each date dir into a schema-valid timeline, ascending', () => {
    const root = path.join(tmp, 'reports')
    stage(root, '2026-10-12', '49', 81)
    stage(root, '2026-10-10', '49', 20)
    stage(root, '2026-10-11', '49', 50, true) // gzip as stored (gcloud 568)
    stage(root, '2026-10-12', '61', 40)
    const out = path.join(tmp, 'tl.json')
    const r = cli([
      'fold',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--reports-root',
      root,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    const t = readTimeline(out)
    expect(t.dates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12'])
    expect(t.world.map(p => p.districts)).toEqual([1, 1, 2])
    expect(t.districts['61']?.map(p => p.date)).toEqual(['2026-10-12'])
    // R4: one JSON summary line on stdout, logs on stderr.
    const lines = r.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      programYear: PY,
      datesFolded: 3,
      dates: 3,
    })
  })

  it('appends to --existing and leaves its earlier dates alone', () => {
    const first = path.join(tmp, 'a')
    stage(first, '2026-10-10', '49', 20)
    const a = path.join(tmp, 'a.json')
    expect(
      cli([
        'fold',
        '--py',
        PY,
        '--region-history',
        REGIONS,
        '--reports-root',
        first,
        '--out',
        a,
      ]).status
    ).toBe(0)
    const second = path.join(tmp, 'b')
    stage(second, '2026-10-11', '49', 50)
    const b = path.join(tmp, 'b.json')
    const r = cli([
      'fold',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--reports-root',
      second,
      '--existing',
      a,
      '--out',
      b,
    ])
    expect(r.status, r.stderr).toBe(0)
    const t = readTimeline(b)
    expect(t.dates).toEqual(['2026-10-10', '2026-10-11'])
    expect(t.world[0]).toEqual(readTimeline(a).world[0])
  })

  it('refuses a date outside the program year (exit 1), writing nothing', () => {
    const root = path.join(tmp, 'r')
    stage(root, '2026-06-30', '49', 20)
    const out = path.join(tmp, 'tl.json')
    const r = cli([
      'fold',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--reports-root',
      root,
      '--out',
      out,
    ])
    expect(r.status).toBe(1)
    expect(fs.existsSync(out)).toBe(false)
  })

  it('a date dir with no reports is skipped, never a zero point', () => {
    const root = path.join(tmp, 'r')
    stage(root, '2026-10-10', '49', 20)
    fs.mkdirSync(path.join(root, '2026-10-11'), { recursive: true })
    const out = path.join(tmp, 'tl.json')
    const r = cli([
      'fold',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--reports-root',
      root,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(readTimeline(out).dates).toEqual(['2026-10-10'])
  })

  it('a missing region history means no region series, with a warning', () => {
    const root = path.join(tmp, 'r')
    stage(root, '2026-10-10', '49', 20)
    const out = path.join(tmp, 'tl.json')
    const r = cli([
      'fold',
      '--py',
      PY,
      '--region-history',
      path.join(tmp, 'none.json'),
      '--reports-root',
      root,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/no region history/)
    expect(readTimeline(out).regions).toBeNull()
  })
})

describe('ghost', () => {
  const build = (py: string, date: string, root: string, out: string) => {
    stage(root, date, '49', 40)
    const r = cli([
      'fold',
      '--py',
      py,
      '--region-history',
      REGIONS,
      '--reports-root',
      root,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
  }

  it('from the prior year timeline: day grain', () => {
    const cur = path.join(tmp, 'cur.json')
    build(PY, '2026-10-10', path.join(tmp, 'c'), cur)
    // The prior year's timeline is built the same way, one program year back.
    const priorRoot = path.join(tmp, 'p')
    stage(priorRoot, '2025-10-10', '49', 30)
    const prior = path.join(tmp, 'prior.json')
    expect(
      cli([
        'fold',
        '--py',
        '2025-2026',
        '--region-history',
        REGIONS,
        '--reports-root',
        priorRoot,
        '--out',
        prior,
      ]).status
    ).toBe(0)
    const out = path.join(tmp, 'out.json')
    const r = cli([
      'ghost',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--existing',
      cur,
      '--prior-timeline',
      prior,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    const t = readTimeline(out)
    expect(t.prior).toMatchObject({
      programYear: '2025-2026',
      source: 'timeline',
      grain: 'day',
    })
    expect(t.dates).toEqual(['2026-10-10'])
  })

  it('from the ledger history: month grain, labelled', () => {
    const cur = path.join(tmp, 'cur.json')
    build('2019-2020', '2019-10-10', path.join(tmp, 'c'), cur)
    const ledger = path.join(tmp, 'ledger')
    fs.mkdirSync(ledger)
    fs.copyFileSync(
      path.join(FIX, 'raw-education-ledger/2018-2019/district_111.json'),
      path.join(ledger, 'district_111.json')
    )
    const out = path.join(tmp, 'out.json')
    const r = cli([
      'ghost',
      '--py',
      '2019-2020',
      '--region-history',
      REGIONS,
      '--existing',
      cur,
      '--prior-ledger',
      ledger,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    const t = readTimeline(out)
    expect(t.prior).toMatchObject({
      programYear: '2018-2019',
      source: 'ledger-history',
      grain: 'month',
    })
    expect(t.prior?.world).toHaveLength(12)
  })

  it('with no source: the ghost stays null, with a warning (not available, not zero)', () => {
    const cur = path.join(tmp, 'cur.json')
    build(PY, '2026-10-10', path.join(tmp, 'c'), cur)
    const out = path.join(tmp, 'out.json')
    const r = cli([
      'ghost',
      '--py',
      PY,
      '--region-history',
      REGIONS,
      '--existing',
      cur,
      '--out',
      out,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/no prior-year source/)
    expect(readTimeline(out).prior).toBeNull()
  })
})
