/**
 * Region comparison of officer training (#2296): a region's districts on
 * each round's % at 4+, % with all seven and % at the selected threshold,
 * from the one region-rollups file per date, and a district's rank in its
 * region.
 */
import { describe, it, expect } from 'vitest'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import {
  rankInRegion,
  rankingRound,
  regionTrainingRows,
  sortRegionTrainingRows,
} from '../regionTraining'

const dist = (atZero: number, atFour: number, atSeven: number) => [
  atZero,
  0,
  0,
  0,
  atFour,
  0,
  0,
  atSeven,
]

/** Only the fields the comparison reads; the rest of the contract is
 *  irrelevant here. */
const rollups = {
  snapshotDate: '2026-11-15',
  programYear: '2026-2027',
  regions: {
    '05': { districtIds: ['61', '62', '63', '64'] },
    '06': { districtIds: ['70'] },
  },
  districts: {
    // Round 1: 61 = 75% at 4+ (25% all seven); 62 = 50%; 63 = 75%; 64 none.
    '61': {
      clubs: 4,
      region: '05',
      officerTraining: { round1: dist(1, 2, 1), round2: dist(2, 2, 0) },
    },
    '62': {
      clubs: 4,
      region: '05',
      officerTraining: { round1: dist(2, 1, 1), round2: dist(1, 1, 2) },
    },
    '63': {
      clubs: 4,
      region: '05',
      officerTraining: { round1: dist(1, 3, 0), round2: dist(4, 0, 0) },
    },
    // A district whose export carried no officer-training column.
    '64': { clubs: 3, region: '05', officerTraining: null },
    '70': {
      clubs: 2,
      region: '06',
      officerTraining: { round1: dist(0, 2, 0), round2: dist(2, 0, 0) },
    },
  },
} as unknown as RegionRollups

describe('regionTrainingRows', () => {
  it('lists the region’s districts with per-round percentages', () => {
    const rows = regionTrainingRows(rollups, '05', 4)
    expect(rows.map(r => r.districtId)).toEqual(['61', '62', '63', '64'])
    const d61 = rows[0]!
    expect(d61.clubs).toBe(4)
    expect(d61.rounds[0]).toMatchObject({ pctDcp: 75, pctAllSeven: 25 })
    expect(d61.rounds[1]).toMatchObject({ pctDcp: 50, pctAllSeven: 0 })
  })

  it('a district without data reads null, not 0%', () => {
    const d64 = regionTrainingRows(rollups, '05', 4)[3]!
    expect(d64.rounds).toEqual([null, null])
  })

  it('a pre-#2296 file (no field anywhere) reads null for every district', () => {
    const old = structuredClone(rollups) as unknown as {
      districts: Record<string, { officerTraining?: unknown }>
    }
    for (const d of Object.values(old.districts)) delete d.officerTraining
    const rows = regionTrainingRows(old as unknown as RegionRollups, '05', 4)
    expect(rows.every(r => r.rounds[0] === null && r.rounds[1] === null)).toBe(
      true
    )
  })

  it('is empty for a region the date does not have', () => {
    expect(regionTrainingRows(rollups, '14', 4)).toEqual([])
  })

  it('sorts by a round’s % at the threshold, districts without data last', () => {
    const rows = regionTrainingRows(rollups, '05', 4)
    expect(
      sortRegionTrainingRows(rows, { round: 1, metric: 'threshold' }).map(
        r => r.districtId
      )
    ).toEqual(['61', '63', '62', '64'])
    expect(
      sortRegionTrainingRows(rows, { round: 2, metric: 'allSeven' }).map(
        r => r.districtId
      )
    ).toEqual(['62', '61', '63', '64'])
  })
})

describe('rankingRound', () => {
  it('ranks on the open round', () => {
    expect(rankingRound('2026-11-15', '2026-2027')).toBe(2)
    expect(rankingRound('2026-08-01', '2026-2027')).toBe(1)
  })

  it('between rounds, on the latest round that has started', () => {
    expect(rankingRound('2026-10-11', '2026-2027')).toBe(1)
    expect(rankingRound('2027-04-01', '2026-2027')).toBe(2)
  })
})

describe('rankInRegion', () => {
  it('competition-ranks by % at the threshold in the round (ties share)', () => {
    const rows = regionTrainingRows(rollups, '05', 4)
    expect(rankInRegion(rows, '61', 1)).toEqual({ rank: 1, of: 3 })
    expect(rankInRegion(rows, '63', 1)).toEqual({ rank: 1, of: 3 })
    expect(rankInRegion(rows, '62', 1)).toEqual({ rank: 3, of: 3 })
  })

  it('follows the threshold', () => {
    const rows = regionTrainingRows(rollups, '05', 7)
    expect(rankInRegion(rows, '63', 1)).toEqual({ rank: 3, of: 3 })
  })

  it('is null for a district without data or not in the rows', () => {
    const rows = regionTrainingRows(rollups, '05', 4)
    expect(rankInRegion(rows, '64', 1)).toBeNull()
    expect(rankInRegion(rows, '70', 1)).toBeNull()
  })
})
