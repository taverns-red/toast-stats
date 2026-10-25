/**
 * Officer-training roll-up (#2296) — the Training page, Action List section
 * and division/area counts all read these.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ScrapedRecord,
  TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { normalizeClubId } from '@taverns-red/shared-contracts'
import { getOfficerTrainingRounds } from '@taverns-red/analytics-core'
import { extractDcpGoalProgress } from '../dcpGoals'
import {
  distributionOf,
  figuresFromDistribution,
  filterTrainingClubs,
  formatNeeded,
  parseTrainingThreshold,
  roundCurve,
  sameDateLastYear,
  shortClubs,
  thresholdOptionLabel,
  trainingClubsFromSnapshot,
  trainingCsvRows,
  trainingPageUrl,
  trainingRoundContext,
} from '../officerTraining'

/** The captured D61 2026-10-11 club performance export (shared with the
 *  analytics-core roll-up test), wrapped the way the CDN snapshot wraps it. */
function d61Snapshot(): { data: { clubPerformance: ScrapedRecord[] } } {
  const rows = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/analytics-core/src/analytics/__tests__/fixtures/d61-2026-10-11-club-performance.json'
      ),
      'utf-8'
    )
  ) as string[][]
  const header = rows[0]!
  const clubPerformance = rows
    .slice(1)
    .filter(row => row.length === header.length)
    .map(
      row =>
        Object.fromEntries(
          header.map((key, i) => [key, row[i] ?? ''])
        ) as ScrapedRecord
    )
  return { data: { clubPerformance } }
}

describe('parseTrainingThreshold', () => {
  it('defaults to 4 (DCP goal 9) and accepts any whole number 1–7', () => {
    expect(parseTrainingThreshold(null)).toBe(4)
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(parseTrainingThreshold(String(n))).toBe(n)
    }
  })

  it('falls back to 4 for anything outside 1–7', () => {
    for (const raw of ['0', '8', '4.5', '-1', 'x', '', '07']) {
      expect(parseTrainingThreshold(raw)).toBe(4)
    }
  })

  it('labels 7 "All seven officers" and 4 as the DCP threshold', () => {
    expect(thresholdOptionLabel(7)).toBe('All seven officers')
    expect(thresholdOptionLabel(4)).toBe('4+ officers (DCP goal 9)')
    expect(thresholdOptionLabel(1)).toBe('1+ officer')
  })
})

describe('trainingClubsFromSnapshot — D61 2026-10-11', () => {
  const clubs = trainingClubsFromSnapshot(d61Snapshot())!

  it('reads every club and the issue’s Round 1 spread', () => {
    expect(clubs).toHaveLength(161)
    expect(distributionOf(clubs, 1)).toEqual([19, 5, 3, 14, 43, 25, 27, 25])
    expect(distributionOf(clubs, 2)).toEqual([161, 0, 0, 0, 0, 0, 0, 0])
  })

  it('cross-check: every club’s counts equal the per-club DCP goal 9 panel', () => {
    const records = d61Snapshot().data.clubPerformance
    for (const record of records) {
      const club = clubs.find(
        c => c.clubId === normalizeClubId(record['Club Number'])
      )!
      const goal9 = extractDcpGoalProgress(record).find(
        g => g.goalNumber === 9
      )!
      expect([club.round1, club.round2]).toEqual(
        goal9.subItems.map(s => s.achieved)
      )
      // The panel's "achieved" is 4+ in both rounds — the roll-up's
      // default threshold.
      expect(goal9.achieved).toBe(club.round1 >= 4 && club.round2 >= 4)
    }
  })

  it('headline figures: % at 4+ and % with all seven, per round', () => {
    const r1 = figuresFromDistribution(distributionOf(clubs, 1), 4)
    expect(r1.atThreshold).toBe(120)
    expect(r1.shortOneToThree).toBe(22)
    expect(r1.atZero).toBe(19)
    expect(r1.pctDcp).toBeCloseTo((120 / 161) * 100)
    expect(r1.pctAllSeven).toBeCloseTo((25 / 161) * 100)
    const allSeven = figuresFromDistribution(distributionOf(clubs, 1), 7)
    expect(allSeven.atThreshold).toBe(25)
    // 1–3 short of seven = 4, 5 or 6 trained.
    expect(allSeven.shortOneToThree).toBe(43 + 25 + 27)
  })

  it('filters by division and area', () => {
    const divA = filterTrainingClubs(clubs, { division: 'a' })
    expect(divA.length).toBeGreaterThan(0)
    expect(divA.every(c => c.divisionId === 'A')).toBe(true)
    const area = filterTrainingClubs(clubs, { division: 'I', area: '93' })
    expect(area.map(c => c.clubName)).toContain('Extra-Expressif')
    expect(area.every(c => c.areaId === '93')).toBe(true)
  })

  it('lists clubs short of the threshold, fewest officers needed first', () => {
    const short = shortClubs(clubs, 1, 4)
    expect(short).toHaveLength(41)
    expect(short[0]!.needed).toBe(1)
    expect(short[short.length - 1]!.needed).toBe(4)
    expect(short.every(c => c.trained + c.needed === 4)).toBe(true)
    expect(shortClubs(clubs, 1, 7)).toHaveLength(161 - 25)
  })
})

describe('trainingClubsFromSnapshot — not measured', () => {
  it('is null when the export has no officer-training column', () => {
    expect(
      trainingClubsFromSnapshot({
        data: { clubPerformance: [{ 'Club Number': '1', 'Club Name': 'A' }] },
      })
    ).toBeNull()
    expect(trainingClubsFromSnapshot(undefined)).toBeNull()
  })
})

describe('trainingRoundContext', () => {
  it('Oct 25: between rounds, Round 2 opens Nov 1', () => {
    const ctx = trainingRoundContext('2026-10-25', '2026-2027')
    expect(ctx.open).toBeNull()
    expect(ctx.pendingOpen).toBeNull()
    expect(ctx.next).toMatchObject({ round: 2, start: '2026-11-01' })
  })

  it('Nov 1: Round 2 open with 120 days left', () => {
    const ctx = trainingRoundContext('2026-11-01', '2026-2027')
    expect(ctx.open).toMatchObject({ round: 2 })
    expect(ctx.daysLeft).toBe(120)
  })

  it('June: the next year’s Round 1 is open but this snapshot cannot show it', () => {
    const ctx = trainingRoundContext('2026-06-15', '2025-2026')
    expect(ctx.open).toBeNull()
    expect(ctx.pendingOpen).toMatchObject({
      programYear: '2026-2027',
      round: 1,
    })
  })

  it('Aug 31 / Sep 1 boundary for the page’s own program year', () => {
    expect(trainingRoundContext('2026-08-31', '2026-2027').open).toMatchObject({
      round: 1,
    })
    expect(trainingRoundContext('2026-09-01', '2026-2027').open).toBeNull()
  })
})

describe('roundCurve', () => {
  const point = (date: string, round1?: number[]): TimeSeriesDataPoint => ({
    date,
    snapshotId: date,
    membership: 0,
    payments: 0,
    dcpGoals: 0,
    distinguishedTotal: 0,
    clubCounts: {
      total: 0,
      thriving: 0,
      vulnerable: 0,
      interventionRequired: 0,
    },
    ...(round1 && {
      officerTraining: { round1, round2: [10, 0, 0, 0, 0, 0, 0, 0] },
    }),
  })
  const [round1] = getOfficerTrainingRounds('2026-2027')

  it('plots % at the threshold by day of round, skipping points without the field', () => {
    const curve = roundCurve(
      [
        point('2026-07-26'), // published before the field existed
        point('2026-07-31', [5, 0, 0, 0, 5, 0, 0, 0]),
        point('2026-08-31', [2, 0, 0, 0, 4, 0, 0, 4]),
        point('2026-09-15', [0, 0, 0, 0, 6, 0, 0, 4]), // after the round
      ],
      round1,
      4
    )
    expect(curve).toEqual([
      { day: 60, date: '2026-07-31', pct: 50 },
      { day: 91, date: '2026-08-31', pct: 80 },
    ])
  })

  it('is empty with no points', () => {
    expect(roundCurve(undefined, round1, 4)).toEqual([])
  })
})

describe('sameDateLastYear', () => {
  it('picks the closest snapshot a year earlier, within a month', () => {
    expect(
      sameDateLastYear('2026-10-24', ['2025-09-30', '2025-10-31', '2026-10-24'])
    ).toBe('2025-10-31')
    expect(sameDateLastYear('2026-10-24', ['2025-08-31'])).toBeNull()
  })
})

describe('CSV and links', () => {
  it('exports one row per club with both rounds at the threshold', () => {
    const rows = trainingCsvRows(
      [
        {
          clubId: '3045',
          clubName: 'Limestone City Club',
          divisionId: 'A',
          areaId: '01',
          round1: 7,
          round2: 2,
        },
      ],
      7
    )
    expect(rows[1]).toEqual([
      'A',
      '01',
      '3045',
      'Limestone City Club',
      7,
      'Yes',
      2,
      'No',
    ])
  })

  it('builds the pre-filtered Training URL, dropping the default threshold', () => {
    expect(trainingPageUrl('61', { division: 'A', area: '01' })).toBe(
      '/district/61/training?division=A&area=01'
    )
    expect(trainingPageUrl('61', { threshold: 4 })).toBe(
      '/district/61/training'
    )
    expect(trainingPageUrl('61', { threshold: 7 })).toBe(
      '/district/61/training?threshold=7'
    )
  })

  it('says how many more officers a club needs', () => {
    expect(formatNeeded(1)).toBe('1 more officer')
    expect(formatNeeded(3)).toBe('3 more officers')
  })
})
