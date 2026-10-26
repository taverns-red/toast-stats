/**
 * Officer training on the top-level /regions page (#2330): every region's
 * and the world's Round 1 / Round 2 figures at the region Training page's
 * own thresholds (4+ officers, DCP goal 9; all seven), from the one
 * region-rollups file per date. A file without the field is "not
 * available", never 0%; a round that has not opened is "not started".
 */
import { describe, it, expect } from 'vitest'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { regionsTrainingOverview } from '../regionTraining'

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

/* Real shape (cdn snapshots/2026-10-25/region-rollups.json): world and each
   region block carry `officerTraining: {round1: [8], round2: [8]}`; Round 2
   reads all clubs at 0 before it opens. Only the read fields are kept. */
const rollups = {
  snapshotDate: '2026-10-25',
  programYear: '2026-2027',
  world: {
    clubs: 10,
    officerTraining: { round1: dist(2, 5, 3), round2: dist(10, 0, 0) },
  },
  regions: {
    '05': {
      districtIds: ['61'],
      clubs: 4,
      officerTraining: { round1: dist(1, 2, 1), round2: dist(4, 0, 0) },
    },
    // A region with one district whose export had no training column.
    '06': { districtIds: ['70'], clubs: 6, officerTraining: null },
  },
  districts: {},
} as unknown as RegionRollups

describe('regionsTrainingOverview', () => {
  it('reads each region at 4+ (DCP goal 9) and all seven', () => {
    const o = regionsTrainingOverview(rollups, '2026-10-25', '2026-2027')
    const r1 = o.regions.get('05')!.rounds[0]
    expect(r1.state).toBe('measured')
    expect(r1.state === 'measured' && r1.figures).toMatchObject({
      pctDcp: 75,
      pctAllSeven: 25,
    })
  })

  it('gives a world reference figure from the world block', () => {
    const o = regionsTrainingOverview(rollups, '2026-10-25', '2026-2027')
    const r1 = o.world.rounds[0]
    expect(r1.state === 'measured' && r1.figures).toMatchObject({
      pctDcp: 80,
      pctAllSeven: 30,
    })
  })

  it('Round 2 before it opens (Nov 1) is "not started", never 0%', () => {
    const o = regionsTrainingOverview(rollups, '2026-10-25', '2026-2027')
    expect(o.world.rounds[1]).toEqual({
      state: 'notStarted',
      opens: '2026-11-01',
    })
    expect(o.regions.get('05')!.rounds[1].state).toBe('notStarted')
    expect(o.round2Started).toBe(false)
  })

  it('Round 2 once open reads its figures', () => {
    const o = regionsTrainingOverview(rollups, '2026-11-15', '2026-2027')
    expect(o.world.rounds[1].state).toBe('measured')
    expect(o.round2Started).toBe(true)
  })

  it('a region whose block is null is "not available"', () => {
    const o = regionsTrainingOverview(rollups, '2026-10-25', '2026-2027')
    expect(o.regions.get('06')!.rounds[0]).toEqual({ state: 'notAvailable' })
  })

  it('a file written before the field existed is "not available" everywhere', () => {
    const old = structuredClone(rollups) as unknown as {
      world: { officerTraining?: unknown }
      regions: Record<string, { officerTraining?: unknown }>
    }
    delete old.world.officerTraining
    for (const r of Object.values(old.regions)) delete r.officerTraining
    const o = regionsTrainingOverview(
      old as unknown as RegionRollups,
      '2026-10-20',
      '2026-2027'
    )
    expect(o.available).toBe(false)
    expect(o.world.rounds[0]).toEqual({ state: 'notAvailable' })
    expect(o.regions.get('05')!.rounds[0]).toEqual({ state: 'notAvailable' })
  })

  it('no rollups file for the date is "not available", not an empty page', () => {
    const o = regionsTrainingOverview(null, '2025-09-30', '2025-2026')
    expect(o.available).toBe(false)
    expect(o.world.rounds[0]).toEqual({ state: 'notAvailable' })
    expect(o.regions.size).toBe(0)
  })

  it('a region id is matched however the rankings spell it ("5" vs "05")', () => {
    const o = regionsTrainingOverview(rollups, '2026-10-25', '2026-2027')
    expect(o.forRegion('5').rounds[0].state).toBe('measured')
    expect(o.forRegion('99').rounds[0]).toEqual({ state: 'notAvailable' })
  })
})
