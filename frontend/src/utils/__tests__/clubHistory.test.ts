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
  toClubHistoryCsvRows,
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

describe('toClubHistoryCsvRows', () => {
  it('emits a header row followed by one data row per program year', () => {
    const rows: ClubHistoryRow[] = [
      buildClubHistoryRow(2023, '2024-06-30', makeClub()),
      buildClubHistoryRow(2022, '2023-06-30', undefined),
    ]
    const csv = toClubHistoryCsvRows(rows)
    expect(csv).toHaveLength(3) // header + 2 rows
    expect(csv[0]).toEqual([
      'Program Year',
      'DCP Goals',
      'Distinguished',
      'Membership Base',
      'Membership End',
      'Membership Net',
      'October Renewals',
      'April Renewals',
      'Status',
    ])
    expect(csv[1]).toEqual([
      '2023-2024',
      7,
      'Select Distinguished',
      20,
      32,
      12,
      18,
      16,
      'Active',
    ])
  })

  it('uses empty cells (not em-dashes) for missing values so the CSV stays numeric', () => {
    const csv = toClubHistoryCsvRows([
      buildClubHistoryRow(2021, '2022-06-30', undefined),
    ])
    expect(csv[1]).toEqual(['2021-2022', '', '', '', '', '', '', '', ''])
  })
})
