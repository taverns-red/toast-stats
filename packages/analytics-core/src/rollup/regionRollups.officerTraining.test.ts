/**
 * Officer training in the region rollups (#2296).
 *
 * The region pages compare their districts on officer training without
 * fetching every district's snapshot, so `snapshots/{date}/region-rollups.json`
 * carries each block's clubs-by-officers-trained distribution per round.
 * Absent is not zero: a district whose export has no officer-training column
 * reads null, and so does every block above it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DistrictRegionHistorySchema,
  RegionRollupsSchema,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import {
  buildRegionRollups,
  readRegionRollupInput,
  type RegionRollupClub,
  type RegionRollupDistrictInput,
} from './regionRollups.js'

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  '__tests__/fixtures/region-rollups'
)
const DATE = '2026-06-30'
const GENERATED_AT = '2026-10-13T00:00:00.000Z'

const history = (): DistrictRegionHistory =>
  DistrictRegionHistorySchema.parse(
    JSON.parse(
      readFileSync(join(FIX, 'config/district-region-history.json'), 'utf-8')
    )
  )

const club = (
  clubId: string,
  trained?: [number, number]
): RegionRollupClub => ({
  clubId,
  membershipCount: 20,
  membershipBase: 20,
  paymentsCount: 30,
  dcpGoals: 3,
  ...(trained && {
    officersTrainedRound1: trained[0],
    officersTrainedRound2: trained[1],
  }),
})

const district = (
  districtId: string,
  clubs: RegionRollupClub[]
): RegionRollupDistrictInput => ({ districtId, clubs, prospectiveClubs: null })

// Districts 01 and 68 sit in regions 02 and 04 in 2025-26 (the history
// fixture); 111 in region 07.
function build(districts: RegionRollupDistrictInput[]) {
  return buildRegionRollups({
    snapshotDate: DATE,
    rankings: districts.map(d => ({ districtId: d.districtId })),
    districts,
    regionHistory: history(),
    generatedAt: GENERATED_AT,
  }).rollups
}

describe('region rollups: officer training (#2296)', () => {
  it('gives each district its clubs by officers trained, per round', () => {
    const rollups = build([
      district('01', [club('1', [4, 0]), club('2', [7, 2]), club('3', [0, 0])]),
      district('68', [club('4', [3, 7])]),
    ])
    expect(rollups.districts['01']!.officerTraining).toEqual({
      round1: [1, 0, 0, 0, 1, 0, 0, 1],
      round2: [2, 0, 1, 0, 0, 0, 0, 0],
    })
    expect(rollups.districts['68']!.officerTraining).toEqual({
      round1: [0, 0, 0, 1, 0, 0, 0, 0],
      round2: [0, 0, 0, 0, 0, 0, 0, 1],
    })
    expect(RegionRollupsSchema.safeParse(rollups).success).toBe(true)
  })

  it('world and each region are the sum of their districts', () => {
    const rollups = build([
      district('01', [club('1', [4, 0]), club('2', [7, 2])]),
      district('68', [club('4', [3, 7])]),
    ])
    expect(rollups.regions!['02']!.officerTraining).toEqual(
      rollups.districts['01']!.officerTraining
    )
    expect(rollups.world.officerTraining).toEqual({
      round1: [0, 0, 0, 1, 1, 0, 0, 1],
      round2: [1, 0, 1, 0, 0, 0, 0, 1],
    })
  })

  it('a district without the columns reads null, and so do its region and the world', () => {
    const rollups = build([
      district('01', [club('1', [4, 0])]),
      district('111', [club('5')]),
    ])
    expect(rollups.districts['111']!.officerTraining).toBeNull()
    expect(rollups.regions!['07']!.officerTraining).toBeNull()
    expect(rollups.world.officerTraining).toBeNull()
    expect(rollups.regions!['02']!.officerTraining).not.toBeNull()
  })

  it('counts a club in two district files once, in the first', () => {
    const rollups = build([
      district('01', [club('1', [4, 0])]),
      district('68', [club('1', [4, 0]), club('9', [1, 1])]),
    ])
    expect(rollups.world.officerTraining!.round1).toEqual([
      0, 1, 0, 0, 1, 0, 0, 0,
    ])
  })

  it('an earlier file without the field still validates (absent, not invalid)', () => {
    const rollups = build([district('01', [club('1', [4, 0])])])
    const { officerTraining: _drop, ...world } = rollups.world
    expect(RegionRollupsSchema.safeParse({ ...rollups, world }).success).toBe(
      true
    )
  })
})

describe('readRegionRollupInput: officer-training cells (#2296)', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('joins each club to its Off. Trained Round 1/2 cells on the canonical id', () => {
    dir = mkdtempSync(join(tmpdir(), 'rollup-officer-training-'))
    writeFileSync(
      join(dir, 'all-districts-rankings.json'),
      JSON.stringify({
        metadata: { snapshotId: DATE },
        rankings: [{ districtId: '61' }],
      })
    )
    writeFileSync(
      join(dir, 'district_61.json'),
      JSON.stringify({
        data: {
          clubs: [
            { clubId: '3045', membershipCount: 11, membershipBase: 13 },
            { clubId: '28678571', membershipCount: 9, membershipBase: 25 },
          ],
          clubPerformance: [
            {
              'Club Number': '00003045',
              'Off. Trained Round 1': '0',
              'Off. Trained Round 2': '0',
            },
            {
              'Club Number': '28678571',
              'Off. Trained Round 1': '6',
              'Off. Trained Round 2': '',
            },
          ],
        },
      })
    )
    const { districts } = readRegionRollupInput(dir)
    expect(
      districts[0]!.clubs.map(c => [
        c.clubId,
        c.officersTrainedRound1,
        c.officersTrainedRound2,
      ])
    ).toEqual([
      ['3045', 0, 0],
      ['28678571', 6, 0],
    ])
  })
})
