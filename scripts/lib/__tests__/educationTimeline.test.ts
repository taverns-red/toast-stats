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
  EducationTimelineSchema,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
  type EducationTimeline,
} from '@taverns-red/shared-contracts'
import { rollUpEducationProgramYear } from '../educationRollup.js'
import {
  foldReportsDate,
  ghostFromLedger,
  ghostFromRollups,
  ghostFromTimeline,
  timelineIndexRow,
  upsertTimelineDate,
  withPrior,
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
    expect(EducationTimelineSchema.safeParse(t).success).toBe(true)
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
    expect(EducationTimelineSchema.safeParse(replaced).success).toBe(true)
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

  it('from the prior year per-date reports: day grain', () => {
    const entries = [D1, D3].map(date => ({
      date,
      rollup: foldReportsDate({
        programYear: PY,
        date,
        reports: STATES[date] ?? [],
        regionHistory,
      }),
    }))
    const g = ghostFromRollups(PY, entries)
    expect(g?.source).toBe('reports')
    expect(g?.grain).toBe('day')
    expect(g?.world.at(-1)?.total).toBe(
      rawTotal(81) + rawTotal(40) + rawTotal(15)
    )
  })

  it('no per-date reports: null, not a zero line', () => {
    expect(ghostFromRollups(PY, [])).toBeNull()
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
    expect(EducationTimelineSchema.safeParse(next).success).toBe(true)
  })
})

describe('timelineIndexRow', () => {
  it('names the path, asOf, date count and the ghost grain', () => {
    const t = build([D1, D3]) as EducationTimeline
    expect(timelineIndexRow(t)).toEqual({
      programYear: PY,
      path: 'derived/education-timeline/2026-2027.json',
      asOf: D3,
      dates: 2,
      priorGrain: null,
    })
    const g = withPrior(t, ghostFromTimeline(t))
    expect(timelineIndexRow(g).priorGrain).toBe('day')
  })
})
