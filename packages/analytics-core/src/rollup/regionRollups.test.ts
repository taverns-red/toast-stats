/**
 * Region and world rollups (#1799, epic #1781).
 *
 * Inputs are recorded staging captures (see
 * `__tests__/fixtures/region-rollups/README.md`). Every expected count below
 * was computed independently of this module (a Python pass over the same
 * fixture bytes), not read back from its output.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DistrictRegionHistorySchema,
  RegionRollupsSchema,
  type DistrictRegionHistory,
  type RegionRollupFigures,
} from '@taverns-red/shared-contracts'
import {
  buildRegionRollups,
  readRegionRollupInput,
  type RegionRollupDistrictInput,
} from './regionRollups.js'
import { readSnapshotRollupInput, rollUpGlobal } from './globalRollup.js'

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  '__tests__/fixtures/region-rollups'
)
const CLOSE = '2026-06-30'
const DAILY = '2026-10-12'
const GENERATED_AT = '2026-10-13T00:00:00.000Z'

const history = (): DistrictRegionHistory =>
  DistrictRegionHistorySchema.parse(
    JSON.parse(
      readFileSync(join(FIX, 'config/district-region-history.json'), 'utf-8')
    )
  )

const input = (date: string) =>
  readRegionRollupInput(join(FIX, 'snapshots', date))

function build(
  date: string,
  regionHistory: DistrictRegionHistory | null = history()
) {
  const { rankings, districts } = input(date)
  return buildRegionRollups({
    snapshotDate: date,
    rankings,
    districts,
    regionHistory,
    generatedAt: GENERATED_AT,
  })
}

const COUNT_KEYS = (f: RegionRollupFigures): Record<string, number | null> => ({
  clubs: f.clubs,
  membership: f.membership,
  payments: f.payments,
  ...Object.fromEntries(
    Object.entries(f.health).map(([k, v]) => [`health.${k}`, v])
  ),
  ...Object.fromEntries(
    Object.entries(f.clubStatus).map(([k, v]) => [`clubStatus.${k}`, v])
  ),
  ...Object.fromEntries(
    Object.entries(f.distinguished).map(([k, v]) => [`distinguished.${k}`, v])
  ),
  ...Object.fromEntries(
    Object.entries(f.compliance).map(([k, v]) => [`compliance.${k}`, v])
  ),
  ...Object.fromEntries(
    Object.entries(f.growth).map(([k, v]) => [`growth.${k}`, v])
  ),
})

/** Sum figure-by-figure; a null anywhere makes that figure null. */
function sumOf(rows: RegionRollupFigures[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const row of rows) {
    for (const [k, v] of Object.entries(COUNT_KEYS(row))) {
      const prev = k in out ? out[k]! : 0
      out[k] = prev === null || v === null ? null : prev + v
    }
  }
  return out
}

describe('buildRegionRollups — the 2025-26 June close (#1799)', () => {
  it('validates against the shared contract', () => {
    const { rollups, missingDistricts } = build(CLOSE)
    expect(missingDistricts).toEqual([])
    expect(RegionRollupsSchema.safeParse(rollups).success).toBe(true)
  })

  it('takes the program year from the directory date, not the July collection date', () => {
    // The rankings were collected on 2026-07-25 (metadata.snapshotId). Read
    // from that, the year is 2026-27, when District 01 no longer existed:
    // it would fall out of Region 02 (CLAUDE.md PY tripwire, #1284).
    expect(input(CLOSE).rankingsSnapshotId).toBe('2026-07-25')
    const { rollups } = build(CLOSE)
    expect(rollups.programYear).toBe('2025-2026')
    expect(rollups.regionMembership).toEqual({
      source: 'config/district-region-history.json',
      asOf: '2026-10-12',
      programYear: '2025-2026',
    })
    expect(rollups.districts['01']!.region).toBe('02')
    expect(rollups.regions!['02']!.districtIds).toEqual(['01'])
  })

  it('counts each in-scope district from its own clubs', () => {
    const { rollups } = build(CLOSE)
    expect(rollups.districts['01']).toEqual({
      region: '02',
      clubs: 116,
      membership: 1707,
      payments: 3748,
      health: { thriving: 45, vulnerable: 21, interventionRequired: 50 },
      clubStatus: {
        active: 108,
        low: 2,
        ineligible: 3,
        suspended: 3,
        other: 0,
      },
      distinguished: {
        smedley: 7,
        president: 11,
        select: 4,
        distinguished: 23,
        notDistinguished: 71,
      },
      compliance: {
        cspSubmitted: 102,
        octoberDuesOnTime: 94,
        aprilDuesOnTime: 92,
        officerListOnTime: 108,
      },
      growth: { prospective: null, chartered: 1, suspended: 3 },
    })
    expect(rollups.districts['111']).toMatchObject({
      region: '07',
      clubs: 24,
      health: { thriving: 6, vulnerable: 8, interventionRequired: 10 },
      clubStatus: { active: 22, low: 2, ineligible: 0, suspended: 0, other: 0 },
      compliance: {
        cspSubmitted: 22,
        octoberDuesOnTime: 19,
        aprilDuesOnTime: 20,
        officerListOnTime: 18,
      },
      growth: { prospective: null, chartered: 1, suspended: 0 },
    })
    expect(rollups.districts['68']).toMatchObject({
      region: '04',
      clubs: 35,
      membership: 447,
      payments: 1033,
      distinguished: {
        smedley: 2,
        president: 0,
        select: 0,
        distinguished: 1,
        notDistinguished: 32,
      },
      growth: { prospective: null, chartered: 1, suspended: 2 },
    })
  })

  it('scopes to the date’s rankings: the renumbered District 201 file is excluded, not double-counted', () => {
    const { rollups } = build(CLOSE)
    expect(rollups.scope.excludedDistricts).toEqual(['201'])
    expect(rollups.scope.duplicateClubs).toEqual([])
    expect(Object.keys(rollups.districts).sort()).toEqual([
      '01',
      '111',
      '68',
      'U',
    ])
    expect(rollups.world.districts).toBe(4)
    expect(rollups.world.clubs).toBe(222)
    expect(rollups.world.membership).toBe(3148)
    expect(rollups.world.payments).toBe(6973)
  })

  it('reports the undistricted bucket as unassigned, never as a region, and keeps it in the world', () => {
    const { rollups } = build(CLOSE)
    expect(rollups.districts['U']!.region).toBeNull()
    expect(rollups.scope.unassignedDistricts).toEqual(['U'])
    expect(Object.keys(rollups.regions!).sort()).toEqual(['02', '04', '07'])
    expect(rollups.world.clubStatus.suspended).toBe(10)
    expect(rollups.world.growth).toEqual({
      prospective: null,
      chartered: 6,
      suspended: 10,
    })
  })

  it('every block is a grouping of one entity set: world = Σ districts, region = Σ its districts', () => {
    const { rollups } = build(CLOSE)
    const districts = Object.values(rollups.districts)
    expect(COUNT_KEYS(rollups.world)).toEqual(sumOf(districts))
    for (const [region, block] of Object.entries(rollups.regions!)) {
      const members = block.districtIds.map(id => rollups.districts[id]!)
      expect(members.every(d => d.region === region)).toBe(true)
      expect(COUNT_KEYS(block)).toEqual(sumOf(members))
    }
  })

  it('agrees with the worldwide rollup over the same files (the universes coincide)', () => {
    const { rollups } = build(CLOSE)
    const global = rollUpGlobal(
      readSnapshotRollupInput(join(FIX, 'snapshots', CLOSE), CLOSE)
    )
    expect(rollups.world.clubs).toBe(global.clubCount)
    expect(rollups.world.membership).toBe(global.totalMembership)
    expect(rollups.world.payments).toBe(global.totalPayments)
    expect(rollups.world.growth.chartered).toBe(global.newClubsStillActive)
    expect(rollups.world.growth.suspended).toBe(global.suspendedClubs)
  })

  it('is deterministic: district input order does not change a byte', () => {
    const { rankings, districts } = input(CLOSE)
    const a = buildRegionRollups({
      snapshotDate: CLOSE,
      rankings,
      districts,
      regionHistory: history(),
      generatedAt: GENERATED_AT,
    })
    const b = buildRegionRollups({
      snapshotDate: CLOSE,
      rankings,
      districts: [...districts].reverse(),
      regionHistory: history(),
      generatedAt: GENERATED_AT,
    })
    expect(JSON.stringify(b.rollups)).toBe(JSON.stringify(a.rollups))
  })
})

describe('buildRegionRollups — degrading per row (#1799)', () => {
  it('names a listed district with no file instead of zero-filling it', () => {
    const { rankings, districts } = input(CLOSE)
    const { missingDistricts } = buildRegionRollups({
      snapshotDate: CLOSE,
      rankings,
      districts: districts.filter(d => d.districtId !== '68'),
      regionHistory: history(),
      generatedAt: GENERATED_AT,
    })
    expect(missingDistricts).toEqual(['68'])
  })

  it('without a region history, regions are null (not empty) and the world still builds', () => {
    const { rollups } = build(CLOSE, null)
    expect(rollups.regions).toBeNull()
    expect(rollups.regionMembership).toBeNull()
    expect(rollups.regionMembershipNote).toMatch(
      /config\/district-region-history\.json/
    )
    expect(rollups.scope.unassignedDistricts).toEqual([])
    expect(rollups.districts['01']!.region).toBeNull()
    expect(rollups.world.clubs).toBe(222)
  })

  it('a history that has no entry for the program year leaves regions null, naming the year', () => {
    const h = history()
    h.programYears = h.programYears.filter(py => py !== '2025-2026')
    for (const d of Object.values(h.districts)) {
      delete d.byProgramYear['2025-2026']
    }
    const { rollups } = build(CLOSE, h)
    expect(rollups.regions).toBeNull()
    expect(rollups.regionMembershipNote).toMatch(/2025-2026/)
  })

  it('a district the history does not know is unassigned, not dropped', () => {
    const h = history()
    delete h.districts['111']
    const { rollups } = build(CLOSE, h)
    expect(rollups.districts['111']!.region).toBeNull()
    expect(rollups.scope.unassignedDistricts).toEqual(['111', 'U'])
    expect(rollups.regions!['07']).toBeUndefined()
    expect(rollups.world.clubs).toBe(222)
  })

  it('a district without a column reads null for that figure, and so does every block above it', () => {
    const { rankings, districts } = input(CLOSE)
    const stripped: RegionRollupDistrictInput[] = districts.map(d =>
      d.districtId === '111'
        ? {
            ...d,
            clubs: d.clubs.map(c => ({ ...c, officerListOnTime: undefined })),
          }
        : d
    )
    const { rollups } = buildRegionRollups({
      snapshotDate: CLOSE,
      rankings,
      districts: stripped,
      regionHistory: history(),
      generatedAt: GENERATED_AT,
    })
    expect(rollups.districts['111']!.compliance.officerListOnTime).toBeNull()
    expect(rollups.regions!['07']!.compliance.officerListOnTime).toBeNull()
    expect(rollups.world.compliance.officerListOnTime).toBeNull()
    // Other districts and other figures are untouched.
    expect(rollups.districts['68']!.compliance.officerListOnTime).toBe(22)
    expect(rollups.world.compliance.aprilDuesOnTime).toBe(159)
  })
})

describe('buildRegionRollups — the daily feed (#1799)', () => {
  it('uses the new program year’s region and counts prospective clubs', () => {
    const { rollups } = build(DAILY)
    expect(rollups.programYear).toBe('2026-2027')
    expect(rollups.districts['61']).toEqual({
      region: '05',
      clubs: 161,
      membership: 2183,
      payments: 3391,
      health: { thriving: 30, vulnerable: 46, interventionRequired: 85 },
      clubStatus: {
        active: 137,
        low: 17,
        ineligible: 7,
        suspended: 0,
        other: 0,
      },
      distinguished: {
        smedley: 0,
        president: 0,
        select: 0,
        distinguished: 5,
        notDistinguished: 156,
      },
      compliance: {
        cspSubmitted: 143,
        octoberDuesOnTime: 132,
        aprilDuesOnTime: 0,
        officerListOnTime: 156,
      },
      // No charter or suspension date anywhere in the date's clubs: the
      // column cannot be told from "none yet", so both read unknown (null).
      growth: { prospective: 8, chartered: null, suspended: null },
    })
  })

  it('reads Smedley as null before 2025-26, when the club rung did not exist', () => {
    const { rankings, districts } = input(CLOSE)
    const { rollups } = buildRegionRollups({
      snapshotDate: '2025-06-30',
      rankings,
      districts,
      regionHistory: history(),
      generatedAt: GENERATED_AT,
    })
    expect(rollups.programYear).toBe('2024-2025')
    expect(rollups.world.distinguished.smedley).toBeNull()
  })
})
