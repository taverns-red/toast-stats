/**
 * Education timeline fold (#2591, epic #2590) — pure logic.
 *
 * Fixtures: the D49 daily dataset recorded from staging on 2026-10-13
 * (fixtures/education-rollup/), sliced into cumulative states and cloned to
 * D61 / D85 so three snapshot dates, three regions (01, 05, 14) and a
 * district missing on one date are covered. The expected numbers are summed
 * straight from the fixture's records, independently of the fold.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DistrictRegionHistorySchema,
  DistrictReportsDatasetSchema,
  EducationLedgerHistoryFileSchema,
  EducationTimelineEntitySchema,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'
import { rollUpEducationProgramYear } from '../educationRollup.js'
import {
  foldReportsDate,
  ghostFromLedger,
  ghostFromTimeline,
  joinTimeline,
  planTimelineUpdates,
  splitTimeline,
  timelineIndexRow,
  upsertTimelineDate,
  withPrior,
  type EducationTimeline,
  type TimelineFiles,
} from '../educationTimeline.js'

const FIX = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/education-rollup'
)
const json = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf-8'))
const regionHistory = DistrictRegionHistorySchema.parse(
  json('config/district-region-history.json')
)
const d49 = DistrictReportsDatasetSchema.parse(
  json('snapshots/2026-10-12/district_49_reports.json')
)

/** Every published file of a timeline satisfies the entity contract. */
const valid = (t: EducationTimeline): boolean =>
  [...splitTimeline(t).values()].every(
    f => EducationTimelineEntitySchema.safeParse(f).success
  )

const PY = '2026-2027'
const D1 = '2026-10-10'
const D2 = '2026-10-11'
const D3 = '2026-10-12'

/** The fixture's records, first `n`, as a dataset for district `id`. */
function dataset(id: string, n: number): DistrictReportsDataset {
  const ach = d49.sections.educationAchievements
  if (!ach) throw new Error('fixture has education achievements')
  return {
    ...d49,
    districtId: id,
    sections: {
      ...d49.sections,
      educationAchievements: { ...ach, records: ach.records.slice(0, n) },
    },
  }
}
const recordsOf = (n: number) =>
  (d49.sections.educationAchievements?.records ?? []).slice(0, n)
const rawTotal = (n: number): number =>
  recordsOf(n).reduce((s, r) => s + r.achievementCount, 0)

/** Cumulative states: D85 has no reports on D2. */
const STATES: Record<string, DistrictReportsDataset[]> = {
  [D1]: [dataset('49', 20), dataset('61', 10), dataset('85', 5)],
  [D2]: [dataset('49', 50), dataset('61', 30)],
  [D3]: [dataset('49', 81), dataset('61', 40), dataset('85', 15)],
}
const counts: Record<string, Record<string, number>> = {
  [D1]: { '49': 20, '61': 10, '85': 5 },
  [D2]: { '49': 50, '61': 30 },
  [D3]: { '49': 81, '61': 40, '85': 15 },
}

const build = (dates: string[]): EducationTimeline | null => {
  let t: EducationTimeline | null = null
  for (const date of dates) {
    const rollup = foldReportsDate({
      programYear: PY,
      date,
      reports: STATES[date] ?? [],
      regionHistory,
    })
    t = upsertTimelineDate(t, PY, date, rollup)
  }
  return t
}

const awardsAt = (p: {
  levels: number[]
  dtm: number
  legacy: number
  other: number
}): number => p.levels.reduce((a, b) => a + b, 0) + p.dtm + p.legacy + p.other

describe('consistency with the education rollup across 3 dates', () => {
  const t = build([D1, D2, D3])
  it('validates against the contract', () => {
    expect(t && valid(t)).toBe(true)
    expect(t?.dates).toEqual([D1, D2, D3])
    expect(t?.asOf).toBe(D3)
  })

  for (const date of [D1, D2, D3]) {
    it(`${date}: the world point equals the rollup and the raw records`, () => {
      const rollup = rollUpEducationProgramYear({
        programYear: PY,
        source: 'reports',
        sourceDate: date,
        ledgerFiles: [],
        reports: STATES[date] ?? [],
        districtIds: [],
        regionHistory,
      })
      const p = t?.world.find(x => x.date === date)
      expect(p).toBeDefined()
      if (!p) return
      const w = rollup.world.totals
      expect(awardsAt(p)).toBe(w.awards)
      expect(p.dtm).toBe(w.dtm)
      expect(p.legacy).toBe(w.legacy)
      expect(p.other).toBe(w.other)
      expect(p.levels.reduce((a, b) => a + b, 0)).toBe(w.pathways)
      // Independent of the fold: summed straight from the fixture records.
      const raw = Object.values(counts[date] ?? {}).reduce(
        (s, n) => s + rawTotal(n),
        0
      )
      expect(awardsAt(p)).toBe(raw)
      expect(p.districts).toBe(Object.keys(counts[date] ?? {}).length)
      // Level cells match the rollup's pathways matrix.
      const cells = [0, 0, 0, 0, 0]
      for (const m of Object.values(rollup.world.pathwaysMatrix)) {
        m.forEach((n, i) => (cells[i] = (cells[i] as number) + n))
      }
      expect(p.levels).toEqual(cells)
    })
  }

  it('a district matches the rollup district block on each date', () => {
    for (const date of [D1, D2, D3]) {
      const n = counts[date]?.['49'] ?? 0
      const p = t?.districts['49']?.find(x => x.date === date)
      expect(p && awardsAt(p)).toBe(rawTotal(n))
    }
  })
})

describe('absent, never zero', () => {
  const t = build([D1, D2, D3])
  it('a district with no reports on a date has no point that date', () => {
    expect(t?.districts['85']?.map(p => p.date)).toEqual([D1, D3])
  })
  it('its region has no point that date, and the world counts only the present', () => {
    expect(t?.regions?.['14']?.map(p => p.date)).toEqual([D1, D3])
    expect(t?.world.find(p => p.date === D2)?.districts).toBe(2)
  })
  it('the coverage count is on each aggregate point', () => {
    expect(t?.world.map(p => p.districts)).toEqual([3, 2, 3])
  })
})

describe('upsertTimelineDate', () => {
  it('replaces a date in place and touches no other date', () => {
    const before = build([D1, D2, D3]) as EducationTimeline
    const replaced = upsertTimelineDate(
      before,
      PY,
      D2,
      foldReportsDate({
        programYear: PY,
        date: D2,
        reports: [dataset('49', 60)],
        regionHistory,
      })
    )
    expect(replaced.dates).toEqual([D1, D2, D3])
    expect(replaced.world[0]).toEqual(before.world[0])
    expect(replaced.world[2]).toEqual(before.world[2])
    const p = replaced.world[1]
    expect(p && awardsAt(p)).toBe(rawTotal(60))
    // D61 vanished on the replaced date: absent, not stale.
    expect(replaced.districts['61']?.map(x => x.date)).toEqual([D1, D3])
    expect(valid(replaced)).toBe(true)
  })

  it('is idempotent for the same date', () => {
    const once = build([D1, D2, D3]) as EducationTimeline
    const rollup = foldReportsDate({
      programYear: PY,
      date: D3,
      reports: STATES[D3] ?? [],
      regionHistory,
    })
    expect(upsertTimelineDate(once, PY, D3, rollup)).toEqual(once)
  })

  it('inserts an earlier date in order', () => {
    const t = build([D3, D1, D2])
    expect(t?.dates).toEqual([D1, D2, D3])
    expect(t).toEqual(build([D1, D2, D3]))
  })

  it('keeps the prior year across an update', () => {
    const base = build([D1]) as EducationTimeline
    const withGhost = withPrior(base, ghostFromTimeline(base))
    const next = upsertTimelineDate(
      withGhost,
      PY,
      D2,
      foldReportsDate({
        programYear: PY,
        date: D2,
        reports: STATES[D2] ?? [],
        regionHistory,
      })
    )
    expect(next.prior).toEqual(withGhost.prior)
  })

  it('refuses a date outside the program year', () => {
    expect(() =>
      upsertTimelineDate(
        null,
        PY,
        '2026-06-30',
        foldReportsDate({
          programYear: PY,
          date: D1,
          reports: STATES[D1] ?? [],
          regionHistory,
        })
      )
    ).toThrow(/program year/)
  })

  it('region history null: no region series', () => {
    const rollup = foldReportsDate({
      programYear: PY,
      date: D1,
      reports: STATES[D1] ?? [],
      regionHistory: null,
    })
    const t = upsertTimelineDate(null, PY, D1, rollup)
    expect(t.regions).toBeNull()
  })

  it('a date where no district has an education section adds no date', () => {
    const t = build([D1]) as EducationTimeline
    const empty = foldReportsDate({
      programYear: PY,
      date: D2,
      reports: [],
      regionHistory,
    })
    const same = upsertTimelineDate(t, PY, D2, empty)
    expect(same.dates).toEqual([D1])
  })
})

describe('prior-year ghost', () => {
  it('from the prior year own timeline: day grain, totals per entity', () => {
    const t = build([D1, D2, D3]) as EducationTimeline
    const g = ghostFromTimeline(t)
    expect(g.programYear).toBe(PY)
    expect(g.source).toBe('timeline')
    expect(g.grain).toBe('day')
    expect(g.world.map(x => x.at)).toEqual([D1, D2, D3])
    expect(g.world.map(x => x.total)).toEqual([
      rawTotal(20) + rawTotal(10) + rawTotal(5),
      rawTotal(50) + rawTotal(30),
      rawTotal(81) + rawTotal(40) + rawTotal(15),
    ])
    expect(g.districts['85']?.map(x => x.at)).toEqual([D1, D3])
  })

  describe('from the ledger history: month grain', () => {
    const ledger = EducationLedgerHistoryFileSchema.parse(
      json('raw-education-ledger/2018-2019/district_111.json')
    ) as EducationLedgerHistoryFile
    const g = ghostFromLedger('2018-2019', [ledger], regionHistory)

    it('labels the grain and the source', () => {
      expect(g?.grain).toBe('month')
      expect(g?.source).toBe('ledger-history')
      expect(g?.programYear).toBe('2018-2019')
    })

    it('is a month-end cumulative: non-decreasing, ending at the ledger total', () => {
      const w = g?.world ?? []
      expect(w[0]?.at).toBe('2018-07')
      expect(w.at(-1)?.at).toBe('2019-06')
      expect(w.length).toBe(12)
      w.forEach((p, i) => {
        if (i > 0) expect(p.total).toBeGreaterThanOrEqual(w[i - 1]?.total ?? 0)
      })
      const rollup = rollUpEducationProgramYear({
        programYear: '2018-2019',
        source: 'ledger-history',
        sourceDate: null,
        ledgerFiles: [ledger],
        reports: [],
        districtIds: [],
        regionHistory,
      })
      expect(w.at(-1)?.total).toBe(rollup.world.totals.awards)
      expect(w.at(-1)?.total).toBe(
        ledger.records.reduce((s, r) => s + r.achievementCount, 0)
      )
    })

    it('a no-data ledger is null', () => {
      const nodata = EducationLedgerHistoryFileSchema.parse(
        json('raw-education-ledger/2003-2004/district_17.json')
      )
      expect(ghostFromLedger('2003-2004', [nodata], regionHistory)).toBeNull()
    })
  })

  it('a timeline carrying a ghost still validates', () => {
    const base = build([D1, D2, D3]) as EducationTimeline
    const prior = ghostFromTimeline(base)
    const next = {
      ...base,
      programYear: '2027-2028',
      asOf: '2027-10-01',
      dates: ['2027-10-01'],
      world: [{ ...(base.world[0] as object), date: '2027-10-01' }],
      regions: null,
      districts: {},
      prior,
    }
    expect(valid(next)).toBe(true)
  })
})

describe('timelineIndexRow', () => {
  it('names the PY prefix, asOf, date count and the ghost grain', () => {
    const t = build([D1, D3]) as EducationTimeline
    expect(timelineIndexRow(t)).toEqual({
      programYear: PY,
      prefix: 'derived/education-timeline/2026-2027',
      asOf: D3,
      dates: 2,
      priorGrain: null,
    })
    const g = withPrior(t, ghostFromTimeline(t))
    expect(timelineIndexRow(g).priorGrain).toBe('day')
  })
})

describe('one object per entity (split and join)', () => {
  const t = build([D1, D2, D3]) as EducationTimeline
  it('splits into the world, each region and each district', () => {
    const files = splitTimeline(t)
    expect([...files.keys()].sort()).toEqual([
      'district-49.json',
      'district-61.json',
      'district-85.json',
      'region-01.json',
      'region-05.json',
      'region-14.json',
      'world.json',
    ])
    for (const f of files.values()) {
      expect(EducationTimelineEntitySchema.safeParse(f).success).toBe(true)
    }
  })

  it('a file holds only its own entity: absent dates stay absent', () => {
    const files = splitTimeline(t)
    expect(files.get('district-85.json')?.points.map(p => p.date)).toEqual([
      D1,
      D3,
    ])
    expect(files.get('district-85.json')?.asOf).toBe(D3)
    expect(files.get('world.json')?.points.map(p => p.date)).toEqual([
      D1,
      D2,
      D3,
    ])
    expect(files.get('region-01.json')?.entity).toEqual({
      kind: 'region',
      id: '01',
    })
  })

  it('join(split(t)) is t, with and without a prior year', () => {
    expect(joinTimeline(splitTimeline(t))).toEqual(t)
    const g = withPrior(t, ghostFromTimeline(t))
    expect(joinTimeline(splitTimeline(g))).toEqual(g)
  })

  it('each file carries its own ghost series; an entity the prior lacked has none', () => {
    const prior = ghostFromTimeline(build([D1]) as EducationTimeline)
    const files = splitTimeline(withPrior(t, prior))
    expect(files.get('district-49.json')?.prior).toMatchObject({
      programYear: PY,
      source: 'timeline',
      grain: 'day',
      points: [{ at: D1 }],
    })
    expect(files.get('world.json')?.prior?.points).toHaveLength(1)
    // D61 and D85 reported on D1 too; make a prior without D85.
    const noD85 = ghostFromTimeline(build([D2]) as EducationTimeline)
    expect(
      splitTimeline(withPrior(t, noD85)).get('district-85.json')?.prior
    ).toBeNull()
  })

  it('a world-only set (an index-row stub) joins to a bundle', () => {
    const world = splitTimeline(t).get('world.json')
    if (!world) throw new Error('world file')
    const j = joinTimeline(new Map([['world.json', world]]))
    expect(j?.dates).toEqual([D1, D2, D3])
    expect(j?.districts).toEqual({})
  })

  it('an empty set joins to null', () => {
    expect(joinTimeline(new Map())).toBeNull()
  })
})

describe('planTimelineUpdates (the daily, incremental step)', () => {
  const rollupAt = (programYear: string, date: string, n = 20) =>
    foldReportsDate({
      programYear,
      date,
      reports: [{ ...dataset('49', n), programYear }],
      regionHistory,
    })
  const ledgerRollup = rollUpEducationProgramYear({
    programYear: '2018-2019',
    source: 'ledger-history',
    sourceDate: null,
    ledgerFiles: [],
    reports: [],
    districtIds: ['111'],
    regionHistory,
  })
  const filesOf = (dates: string[]): TimelineFiles =>
    splitTimeline(build(dates) as EducationTimeline)

  it('seeds the current PY (its prefix was consulted, empty), never a ledger PY', () => {
    const r = planTimelineUpdates(
      [ledgerRollup, rollupAt(PY, D3)],
      new Map([[PY, new Map()]]),
      PY
    )
    expect(r.written.map(w => w.programYear)).toEqual([PY])
    expect([...(r.written[0]?.files.keys() ?? [])].sort()).toEqual([
      'district-49.json',
      'region-01.json',
      'world.json',
    ])
    expect(r.rows.map(x => x.programYear)).toEqual([PY])
  })

  it('does nothing for a PY whose prefix was never consulted (no seeding over history)', () => {
    const r = planTimelineUpdates([rollupAt(PY, D3)], new Map(), PY)
    expect(r.written).toEqual([])
    expect(r.skipped).toEqual([{ programYear: PY, reason: expect.any(String) }])
  })

  it('appends today and writes only the files whose data changed', () => {
    const existing = filesOf([D1, D2])
    // Only D49 reports on D3: D61, D85 and their regions are untouched.
    const r = planTimelineUpdates(
      [rollupAt(PY, D3, 81)],
      new Map([[PY, existing]]),
      PY
    )
    const w = r.written[0]
    expect([...(w?.files.keys() ?? [])].sort()).toEqual([
      'district-49.json',
      'region-01.json',
      'world.json',
    ])
    expect(w?.files.get('district-49.json')?.points.map(p => p.date)).toEqual([
      D1,
      D2,
      D3,
    ])
    expect(w?.files.get('district-49.json')?.points.slice(0, 2)).toEqual(
      existing.get('district-49.json')?.points
    )
  })

  it('re-running the same day writes nothing', () => {
    const existing = filesOf([D1, D2, D3])
    const r = planTimelineUpdates(
      [
        foldReportsDate({
          programYear: PY,
          date: D3,
          reports: STATES[D3] ?? [],
          regionHistory,
        }),
      ],
      new Map([[PY, existing]]),
      PY
    )
    expect(r.written).toEqual([])
  })

  it('touches only the current PY, even if an older reports PY rolled up', () => {
    const old = rollupAt('2025-2026', '2026-06-30')
    const r = planTimelineUpdates(
      [old, rollupAt(PY, D3)],
      new Map([[PY, new Map()]]),
      PY
    )
    expect(r.written.map(w => w.programYear)).toEqual([PY])
  })

  it('a seeded year takes its ghost from the prior year files', () => {
    const prior = splitTimeline(
      upsertTimelineDate(
        null,
        '2025-2026',
        '2025-10-12',
        rollupAt('2025-2026', '2025-10-12')
      )
    )
    const r = planTimelineUpdates(
      [rollupAt(PY, D3)],
      new Map([
        [PY, new Map()],
        ['2025-2026', prior],
      ]),
      PY
    )
    expect(r.written[0]?.files.get('world.json')?.prior).toMatchObject({
      programYear: '2025-2026',
      grain: 'day',
    })
    expect(r.rows.map(x => x.programYear)).toEqual(['2025-2026', PY])
    expect(r.rows[1]?.priorGrain).toBe('day')
  })

  it('names a PY known only by its world file in the index rows', () => {
    const world = splitTimeline(build([D1]) as EducationTimeline).get(
      'world.json'
    )
    if (!world) throw new Error('world file')
    const r = planTimelineUpdates(
      [],
      new Map([['2025-2026', new Map([['world.json', world]])]]),
      PY
    )
    expect(r.written).toEqual([])
    expect(r.rows.map(x => x.asOf)).toEqual([D1])
  })

  it('a date with no available district is skipped and named, never fatal', () => {
    const none = foldReportsDate({
      programYear: PY,
      date: D3,
      reports: [],
      regionHistory,
    })
    const r = planTimelineUpdates([none], new Map([[PY, new Map()]]), PY)
    expect(r.written).toEqual([])
    expect(r.skipped).toEqual([{ programYear: PY, reason: expect.any(String) }])
  })

  it('a blocked (unreadable) PY is left alone and not named', () => {
    const r = planTimelineUpdates(
      [rollupAt(PY, D3)],
      new Map([[PY, filesOf([D1])]]),
      PY,
      new Set([PY])
    )
    expect(r.written).toEqual([])
    expect(r.rows).toEqual([])
  })

  describe('a ghost for every entity, whenever its prior-year file exists (review fix 1)', () => {
    const PRIOR = '2025-2026'
    const multi = (
      programYear: string,
      date: string,
      ns: Record<string, number>
    ) =>
      foldReportsDate({
        programYear,
        date,
        reports: Object.entries(ns).map(([id, n]) => ({
          ...dataset(id, n),
          programYear,
        })),
        regionHistory,
      })
    const priorFiles = (): TimelineFiles =>
      splitTimeline(
        upsertTimelineDate(
          null,
          PRIOR,
          '2025-10-12',
          multi(PRIOR, '2025-10-12', { '49': 30, '61': 10, '85': 5 })
        )
      )
    const merged = (
      base: TimelineFiles,
      written: Map<string, EducationTimelineEntity> | undefined
    ): TimelineFiles => new Map([...base, ...(written ?? [])])

    it('a district that first reports on day 10 gets its prior-year series', () => {
      const day1 = planTimelineUpdates(
        [multi(PY, D1, { '49': 20 })],
        new Map([
          [PY, new Map()],
          [PRIOR, priorFiles()],
        ]),
        PY
      )
      const stored = merged(new Map(), day1.written[0]?.files)
      expect(stored.get('district-49.json')?.prior).not.toBeNull()
      expect(stored.has('district-61.json')).toBe(false)
      const day10 = planTimelineUpdates(
        [multi(PY, D2, { '49': 50, '61': 30 })],
        new Map([
          [PY, stored],
          [PRIOR, priorFiles()],
        ]),
        PY
      )
      const fresh = day10.written[0]?.files.get('district-61.json')
      expect(fresh?.prior).toMatchObject({
        programYear: PRIOR,
        source: 'timeline',
        grain: 'day',
      })
      expect(fresh?.prior?.points).toEqual(
        priorFiles()
          .get('district-61.json')
          ?.points.map(p => ({ at: p.date, total: awardsAt(p) }))
      )
    })

    it('a prior-year timeline that appears after seeding is attached, even to an entity not reporting today', () => {
      const seeded = planTimelineUpdates(
        [multi(PY, D1, { '49': 20, '85': 5 })],
        new Map([[PY, new Map()]]),
        PY
      )
      const stored = merged(new Map(), seeded.written[0]?.files)
      expect(stored.get('district-85.json')?.prior).toBeNull()
      // Next day only D49 reports; the prior year's files have since appeared.
      const next = planTimelineUpdates(
        [multi(PY, D2, { '49': 50 })],
        new Map([
          [PY, stored],
          [PRIOR, priorFiles()],
        ]),
        PY
      )
      const w = next.written[0]?.files
      expect(w?.get('district-85.json')?.prior?.programYear).toBe(PRIOR)
      expect(w?.get('district-49.json')?.prior?.programYear).toBe(PRIOR)
    })

    it('names the entity files still without a ghost and without a prior-year file read', () => {
      const r = planTimelineUpdates(
        [multi(PY, D1, { '49': 20, '85': 5 })],
        new Map([[PY, new Map()]]),
        PY
      )
      expect(r.needsPrior).toEqual([
        'district-49.json',
        'district-85.json',
        'region-01.json',
        'region-14.json',
        'world.json',
      ])
    })

    it('does not name an entity whose prior-year file was read', () => {
      const r = planTimelineUpdates(
        [multi(PY, D1, { '49': 20, '85': 5 })],
        new Map([
          [PY, new Map()],
          [PRIOR, priorFiles()],
        ]),
        PY
      )
      // The prior year has no region-01 file (D49 was in region 02 then).
      expect(r.needsPrior).toEqual(['region-01.json'])
    })
  })

  describe('rollover and region moves (review fix 4)', () => {
    const NEXT = '2027-2028'
    const at = (programYear: string, date: string, n: number) =>
      foldReportsDate({
        programYear,
        date,
        reports: [{ ...dataset('49', n), programYear }],
        regionHistory,
      })

    it('when the current PY switches, the old PY stays frozen and the new one is seeded with its ghost', () => {
      const old = splitTimeline(
        upsertTimelineDate(null, PY, '2027-06-30', at(PY, '2027-06-30', 81))
      )
      const r = planTimelineUpdates(
        // The ended year still rolls up (its June close), the new one has its first date.
        [at(PY, '2027-06-30', 81), at(NEXT, '2027-07-31', 10)],
        new Map([
          [NEXT, new Map()],
          [PY, old],
        ]),
        NEXT
      )
      expect(r.written.map(w => w.programYear)).toEqual([NEXT])
      expect(r.rows.map(x => x.programYear)).toEqual([PY, NEXT])
      expect(r.rows[0]?.asOf).toBe('2027-06-30')
      const first = r.written[0]?.files.get('district-49.json')
      expect(first?.prior?.programYear).toBe(PY)
      expect(first?.prior?.points.at(-1)?.total).toBe(rawTotal(81))
    })

    it('a district that moves region between dates leaves each region only the dates it was in', () => {
      const moved = {
        ...regionHistory,
        districts: {
          ...regionHistory.districts,
          '49': {
            ...regionHistory.districts['49'],
            byProgramYear: {
              ...regionHistory.districts['49']?.byProgramYear,
              [PY]: '05',
            },
          },
        },
      } as typeof regionHistory
      const fold = (date: string, h: typeof regionHistory) =>
        foldReportsDate({
          programYear: PY,
          date,
          reports: [dataset('49', date === D1 ? 20 : 50)],
          regionHistory: h,
        })
      const day1 = upsertTimelineDate(null, PY, D1, fold(D1, regionHistory))
      const day2 = upsertTimelineDate(day1, PY, D2, fold(D2, moved))
      const files = splitTimeline(day2)
      expect(files.get('region-01.json')?.points.map(p => p.date)).toEqual([D1])
      expect(files.get('region-05.json')?.points.map(p => p.date)).toEqual([D2])
      expect(files.get('district-49.json')?.points.map(p => p.date)).toEqual([
        D1,
        D2,
      ])
      expect(files.get('world.json')?.points.map(p => p.date)).toEqual([D1, D2])
      expect(valid(day2)).toBe(true)
    })
  })
})
