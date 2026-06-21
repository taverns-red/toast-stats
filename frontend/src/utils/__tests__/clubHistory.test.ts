/**
 * Unit tests for the per-club historical row builder (#1229, epic #1228).
 *
 * Covers buildClubHistoryRow (the per-program-year settled-value view-model)
 * and normalizeTierCode (letter-code + historical word-form normalization,
 * incl. Smedley / tier M — #1226).
 */

import { describe, it, expect } from 'vitest'
import type { ClubStatisticsFile } from '@toastmasters/shared-contracts'
import {
  buildClubHistoryRow,
  normalizeTierCode,
  type ClubHistoryRow,
} from '../clubHistory'

function makeClub(
  overrides: Partial<ClubStatisticsFile> = {}
): ClubStatisticsFile {
  return {
    clubId: '00001234',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 32,
    paymentsCount: 40,
    dcpGoals: 7,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 18,
    aprilRenewals: 16,
    newMembers: 9,
    membershipBase: 20,
    clubStatus: 'Active',
    distinguishedStatus: 'S',
    ...overrides,
  }
}

describe('normalizeTierCode', () => {
  it('returns null for absent / empty status (no distinguished status)', () => {
    expect(normalizeTierCode(undefined)).toBeNull()
    expect(normalizeTierCode('')).toBeNull()
  })

  it('passes through canonical letter codes', () => {
    expect(normalizeTierCode('D')).toBe('D')
    expect(normalizeTierCode('S')).toBe('S')
    expect(normalizeTierCode('P')).toBe('P')
    expect(normalizeTierCode('M')).toBe('M')
  })

  it('maps historical word forms back to letter codes (incl. Smedley)', () => {
    expect(normalizeTierCode('Distinguished')).toBe('D')
    expect(normalizeTierCode('Select Distinguished')).toBe('S')
    expect(normalizeTierCode("President's Distinguished")).toBe('P')
    expect(normalizeTierCode('Smedley Distinguished')).toBe('M')
  })

  it('is case- and whitespace-insensitive for word forms', () => {
    expect(normalizeTierCode('  smedley distinguished  ')).toBe('M')
  })

  it('returns null for an unrecognised value rather than guessing', () => {
    expect(normalizeTierCode('Mystery')).toBeNull()
  })
})

describe('buildClubHistoryRow', () => {
  it('builds a full row from a present club (Select Distinguished)', () => {
    const row = buildClubHistoryRow(2023, '2024-06-28', makeClub())
    expect(row).toMatchObject<Partial<ClubHistoryRow>>({
      startYear: 2023,
      label: '2023-2024',
      yearEndDate: '2024-06-28',
      hasData: true,
      dcpGoals: 7,
      tierCode: 'S',
      tierLabel: 'Select Distinguished',
      membershipBase: 20,
      membershipEnd: 32,
      membershipNet: 12,
      octoberRenewals: 18,
      aprilRenewals: 16,
      clubStatus: 'Active',
    })
  })

  it('renders Smedley (tier M) correctly', () => {
    const row = buildClubHistoryRow(
      2022,
      '2023-06-30',
      makeClub({ distinguishedStatus: 'M' })
    )
    expect(row.tierCode).toBe('M')
    expect(row.tierLabel).toBe('Smedley Distinguished')
  })

  it('treats an absent club (missing year) as a no-data row, not a crash', () => {
    const row = buildClubHistoryRow(2021, '2022-06-30', undefined)
    expect(row.hasData).toBe(false)
    expect(row.startYear).toBe(2021)
    expect(row.label).toBe('2021-2022')
    expect(row.yearEndDate).toBe('2022-06-30')
    expect(row.dcpGoals).toBeNull()
    expect(row.tierCode).toBeNull()
    expect(row.tierLabel).toBe('—')
    expect(row.membershipBase).toBeNull()
    expect(row.membershipEnd).toBeNull()
    expect(row.membershipNet).toBeNull()
    expect(row.clubStatus).toBeNull()
  })

  it('shows an em-dash tier when the club exists but has no distinguished status', () => {
    const row = buildClubHistoryRow(
      2023,
      '2024-06-30',
      makeClub({ distinguishedStatus: '' })
    )
    expect(row.hasData).toBe(true)
    expect(row.tierCode).toBeNull()
    expect(row.tierLabel).toBe('—')
    expect(row.dcpGoals).toBe(7)
  })

  it('reports negative net growth when the club shrank', () => {
    const row = buildClubHistoryRow(
      2023,
      '2024-06-30',
      makeClub({ membershipBase: 40, membershipCount: 25 })
    )
    expect(row.membershipNet).toBe(-15)
  })
})
