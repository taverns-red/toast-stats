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
  lastYearSnapshotFor,
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

  it('cross-check with non-zero Round 2: the panel and the roll-up agree on every pairing (review S4)', () => {
    // The D61 date has Round 2 all zero, so "both rounds" is never true
    // there. Every pairing of 0–7 (and blanks) makes it true for some clubs.
    const cells = ['0', '1', '3', '4', '5', '7', '']
    const records = cells.flatMap((a, i) =>
      cells.map((b, j) => ({
        'Club Number': String(1000 + i * 10 + j),
        'Club Name': `Club ${i}-${j}`,
        Division: 'A',
        Area: '01',
        'Off. Trained Round 1': a,
        'Off. Trained Round 2': b,
      }))
    ) as ScrapedRecord[]
    const rolled = trainingClubsFromSnapshot({
      data: { clubPerformance: records },
    })!
    let credited = 0
    for (const record of records) {
      const club = rolled.find(
        c => c.clubId === normalizeClubId(record['Club Number'])
      )!
      const goal9 = extractDcpGoalProgress(record).find(
        g => g.goalNumber === 9
      )!
      expect([club.round1, club.round2]).toEqual(
        goal9.subItems.map(s => s.achieved)
      )
      expect(goal9.achieved).toBe(club.round1 >= 4 && club.round2 >= 4)
      if (goal9.achieved) credited += 1
    }
    expect(credited).toBe(9) // {4,5,7} × {4,5,7}: not vacuous
    // And the headline count at 4+ is the panel's per-round verdict, summed.
    for (const round of [1, 2] as const) {
      expect(
        figuresFromDistribution(distributionOf(rolled, round), 4).atThreshold
      ).toBe(
        records.filter(
          r =>
            extractDcpGoalProgress(r).find(g => g.goalNumber === 9)!.subItems[
              round - 1
            ]!.achieved >= 4
        ).length
      )
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

describe('lastYearSnapshotFor (review S2)', () => {
  const [r1, r2] = getOfficerTrainingRounds('2026-2027')
  const prior = [
    '2025-07-31',
    '2025-08-31',
    '2025-09-30',
    '2025-10-31',
    '2025-11-30',
    '2025-12-31',
  ] as const

  it('open round: the latest snapshot on or before the same day of last year’s round', () => {
    // Dec 10 is day 39 of Round 2; last year that is Dec 10, 2025 — the
    // nearest snapshot at or before it is Nov 30 (never Dec 31, ahead of it).
    expect(lastYearSnapshotFor(r2!, '2026-12-10', prior)).toEqual({
      date: '2025-11-30',
      kind: 'earlier',
    })
  })

  it('open round: a snapshot on the very same day is "same"', () => {
    expect(lastYearSnapshotFor(r1!, '2026-08-31', prior)).toEqual({
      date: '2025-08-31',
      kind: 'same',
    })
  })

  it('open round, early: no snapshot inside last year’s round yet → none (never one from before it opened)', () => {
    // Nov 5: last year's only earlier snapshot is Oct 31, before Round 2
    // opened, which would read 0%.
    expect(lastYearSnapshotFor(r2!, '2026-11-05', prior)).toBeNull()
  })

  it('closed round: last year’s final snapshot inside the round', () => {
    expect(lastYearSnapshotFor(r1!, '2026-10-24', prior)).toEqual({
      date: '2025-08-31',
      kind: 'final',
    })
  })

  it('a round that has not opened has no comparison', () => {
    expect(lastYearSnapshotFor(r2!, '2026-10-24', prior)).toBeNull()
  })
})

describe('trainingClubsFromSnapshot keeps the club status (review S3)', () => {
  it('carries Club Status so to-do lists can leave out ineligible clubs', () => {
    const clubs = trainingClubsFromSnapshot(d61Snapshot())!
    expect(clubs.filter(c => c.clubStatus === 'Ineligible')).toHaveLength(7)
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
          clubStatus: 'Active',
        },
      ],
      7,
      { round1: 'closed', round2: 'open' }
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

  it('a round that has not opened exports "not open yet", not 0 / No (review S1)', () => {
    const rows = trainingCsvRows(
      [
        {
          clubId: '3045',
          clubName: 'Limestone City Club',
          divisionId: 'A',
          areaId: '01',
          round1: 7,
          round2: 0,
          clubStatus: 'Active',
        },
      ],
      4,
      { round1: 'closed', round2: 'upcoming' }
    )
    expect(rows[1]!.slice(4)).toEqual([
      7,
      'Yes',
      'not open yet',
      'not open yet',
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
