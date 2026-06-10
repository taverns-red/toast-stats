/**
 * Unit Tests for TimeSeriesDataPointBuilder
 *
 * Verifies equivalence between TimeSeriesDataPointBuilder methods and
 * RefreshService reference implementations. Tests parseIntSafe,
 * membership/payment/DCP calculation, distinguished logic, and club
 * health classification.
 *
 * Converted from property-based tests — PBT generated random club
 * performance records; replaced with representative fixed test cases
 * covering field name variants, edge cases, and boundary conditions.
 */

import { describe, it, expect } from 'vitest'
import {
  TimeSeriesDataPointBuilder,
  type DistrictStatisticsInput,
  type ScrapedRecord,
} from '../timeseries/TimeSeriesDataPointBuilder.js'
import {
  getCurrentProgramMonth,
  getDCPCheckpoint,
} from '../analytics/AnalyticsUtils.js'

// Reference implementations for equivalence checking
function refParseIntSafe(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : Math.floor(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return 0
    const parsed = parseInt(trimmed, 10)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function refCalculateTotalMembership(
  district: DistrictStatisticsInput
): number {
  if (district.membership?.total !== undefined) return district.membership.total
  if (district.clubPerformance && district.clubPerformance.length > 0) {
    return district.clubPerformance.reduce((total, club) => {
      return (
        total +
        refParseIntSafe(
          club['Active Members'] ??
            club['Active Membership'] ??
            club['Membership']
        )
      )
    }, 0)
  }
  return 0
}

function refCalculateTotalPayments(district: DistrictStatisticsInput): number {
  return (district.clubPerformance ?? []).reduce((total, club) => {
    const oct = refParseIntSafe(club['Oct. Ren.'] ?? club['Oct. Ren'])
    const apr = refParseIntSafe(club['Apr. Ren.'] ?? club['Apr. Ren'])
    const newM = refParseIntSafe(club['New Members'] ?? club['New'])
    return total + oct + apr + newM
  }, 0)
}

function refCalculateTotalDCPGoals(district: DistrictStatisticsInput): number {
  return (district.clubPerformance ?? []).reduce(
    (total, club) => total + refParseIntSafe(club['Goals Met']),
    0
  )
}

function refIsDistinguished(club: ScrapedRecord): boolean {
  const cspValue =
    club['CSP'] ??
    club['Club Success Plan'] ??
    club['CSP Submitted'] ??
    club['Club Success Plan Submitted']
  if (cspValue !== undefined && cspValue !== null) {
    const csp = String(cspValue).toLowerCase().trim()
    if (['no', 'false', '0', 'not submitted', 'n'].includes(csp)) return false
  }
  const statusField = club['Club Distinguished Status']
  if (statusField !== null && statusField !== undefined) {
    const status = String(statusField).toLowerCase().trim()
    if (
      status !== '' &&
      status !== 'none' &&
      status !== 'n/a' &&
      (status.includes('smedley') ||
        status.includes('president') ||
        status.includes('select') ||
        status.includes('distinguished'))
    ) {
      return true
    }
  }
  const dcpGoals = refParseIntSafe(club['Goals Met'])
  const membership = refParseIntSafe(
    club['Active Members'] ?? club['Active Membership'] ?? club['Membership']
  )
  const memBase = refParseIntSafe(club['Mem. Base'])
  const netGrowth = membership - memBase
  return dcpGoals >= 5 && (membership >= 20 || netGrowth >= 3)
}

function refCalculateDistinguishedTotal(
  district: DistrictStatisticsInput
): number {
  return (district.clubPerformance ?? []).filter(refIsDistinguished).length
}

function refParseCspSubmitted(club: ScrapedRecord): boolean {
  const cspValue =
    club['CSP'] ??
    club['Club Success Plan'] ??
    club['CSP Submitted'] ??
    club['Club Success Plan Submitted']
  // Historical compatibility: field absent → assume submitted
  if (cspValue === undefined || cspValue === null) return true
  const csp = String(cspValue).toLowerCase().trim()
  return !['no', 'false', '0', 'not submitted', 'n'].includes(csp)
}

/**
 * Reference club-health classification (#1120): must match
 * ClubHealthAnalyticsModule.assessClubHealth — monthly DCP checkpoint
 * (§5.3) + CSP requirement, not the legacy `dcpGoals > 0` rule.
 */
function refCalculateClubHealthCounts(district: DistrictStatisticsInput) {
  const clubs = district.clubPerformance ?? []
  const month = getCurrentProgramMonth(district.asOfDate)
  const requiredCheckpoint = getDCPCheckpoint(month)
  let thriving = 0,
    vulnerable = 0,
    interventionRequired = 0
  for (const club of clubs) {
    const membership = refParseIntSafe(
      club['Active Members'] ?? club['Active Membership'] ?? club['Membership']
    )
    const dcpGoals = refParseIntSafe(club['Goals Met'])
    const memBase = refParseIntSafe(club['Mem. Base'])
    const netGrowth = membership - memBase
    if (membership < 12 && netGrowth < 3) interventionRequired++
    else if (
      (membership >= 20 || netGrowth >= 3) &&
      dcpGoals >= requiredCheckpoint &&
      refParseCspSubmitted(club)
    )
      thriving++
    else vulnerable++
  }
  return { total: clubs.length, thriving, vulnerable, interventionRequired }
}

// Test fixtures
const standardClub: ScrapedRecord = {
  'Club Number': '1234',
  'Club Name': 'Test Club',
  'Active Members': '25',
  'Mem. Base': '20',
  'Goals Met': '6',
  'Oct. Ren.': '10',
  'Apr. Ren.': '8',
  'New Members': '3',
  CSP: 'Yes',
  'Club Distinguished Status': 'Distinguished',
}

const altFieldClub: ScrapedRecord = {
  'Club Number': '5678',
  'Club Name': 'Alt Club',
  'Active Membership': '15',
  'Mem. Base': '12',
  'Goals Met': '3',
  'Oct. Ren': '5',
  'Apr. Ren': '4',
  New: '2',
  'Club Success Plan': 'No',
}

const lowMembershipClub: ScrapedRecord = {
  'Club Number': '9999',
  'Club Name': 'Small Club',
  'Active Members': '8',
  'Mem. Base': '10',
  'Goals Met': '1',
  'Oct. Ren.': '2',
  'Apr. Ren.': '1',
  'New Members': '0',
  CSP: 'No',
  'Club Distinguished Status': 'None',
}

const presidentsDistClub: ScrapedRecord = {
  'Club Number': '2222',
  'Club Name': 'Great Club',
  'Active Members': '30',
  'Mem. Base': '22',
  'Goals Met': '9',
  'Oct. Ren.': '15',
  'Apr. Ren.': '12',
  'New Members': '5',
  CSP: 'Yes',
  'Club Distinguished Status': "President's Distinguished",
}

describe('TimeSeriesDataPointBuilder', () => {
  const builder = new TimeSeriesDataPointBuilder()

  // ---------- parseIntSafe equivalence ----------
  describe('parseIntSafe equivalence', () => {
    const cases: Array<[string, string | number | null | undefined]> = [
      ['integer', 42],
      ['zero', 0],
      ['negative', -5],
      ['float', 12.34],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['string number', '123'],
      ['padded string', '  456  '],
      ['non-numeric string', 'abc'],
      ['empty string', ''],
      ['whitespace', '  '],
      ['null', null],
      ['undefined', undefined],
    ]

    it.each(cases)('should match reference for %s', (_desc, value) => {
      expect(
        builder.parseIntSafe(value as string | number | null | undefined)
      ).toBe(refParseIntSafe(value))
    })
  })

  // ---------- calculateTotalMembership equivalence ----------
  describe('calculateTotalMembership equivalence', () => {
    const districts: DistrictStatisticsInput[] = [
      {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [standardClub, altFieldClub],
      },
      {
        districtId: '101',
        asOfDate: '2024-02-01',
        clubPerformance: [lowMembershipClub],
      },
      { districtId: 'F', asOfDate: '2024-03-01', clubPerformance: [] },
      {
        districtId: '1',
        asOfDate: '2024-04-01',
        membership: { total: 500 },
        clubPerformance: [standardClub],
      },
    ]

    it.each(districts.map((d, i) => [`case ${i}: ${d.districtId}`, d]))(
      'should match reference for %s',
      (_desc, district) => {
        expect(
          builder.calculateTotalMembership(district as DistrictStatisticsInput)
        ).toBe(refCalculateTotalMembership(district as DistrictStatisticsInput))
      }
    )
  })

  // ---------- calculateTotalPayments equivalence ----------
  describe('calculateTotalPayments equivalence', () => {
    it('should match reference for multiple clubs with mixed field names', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [standardClub, altFieldClub, lowMembershipClub],
      }
      expect(builder.calculateTotalPayments(district)).toBe(
        refCalculateTotalPayments(district)
      )
    })

    it('should return 0 for empty clubs', () => {
      const district: DistrictStatisticsInput = {
        districtId: '1',
        asOfDate: '2024-01-01',
        clubPerformance: [],
      }
      expect(builder.calculateTotalPayments(district)).toBe(0)
    })
  })

  // ---------- calculateTotalDCPGoals equivalence ----------
  describe('calculateTotalDCPGoals equivalence', () => {
    it('should match reference for multiple clubs', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [standardClub, altFieldClub, presidentsDistClub],
      }
      expect(builder.calculateTotalDCPGoals(district)).toBe(
        refCalculateTotalDCPGoals(district)
      )
    })
  })

  // ---------- isDistinguished equivalence ----------
  describe('isDistinguished equivalence', () => {
    const clubs = [
      standardClub,
      altFieldClub,
      lowMembershipClub,
      presidentsDistClub,
    ]

    it.each(clubs.map(c => [c['Club Name'], c]))(
      'should match reference for %s',
      (_name, club) => {
        expect(builder.isDistinguished(club as ScrapedRecord)).toBe(
          refIsDistinguished(club as ScrapedRecord)
        )
      }
    )

    it('should handle CSP edge cases', () => {
      const cspCases = [
        'Yes',
        'No',
        'no',
        'false',
        '0',
        'not submitted',
        'N',
        null,
        undefined,
      ]
      for (const csp of cspCases) {
        const club: ScrapedRecord = { ...standardClub, CSP: csp }
        expect(builder.isDistinguished(club)).toBe(refIsDistinguished(club))
      }
    })

    it('should handle distinguished status edge cases', () => {
      const statuses = [
        'Distinguished',
        'Select Distinguished',
        "President's Distinguished",
        'Smedley Distinguished',
        'None',
        'N/A',
        '',
        null,
        undefined,
      ]
      for (const status of statuses) {
        const club: ScrapedRecord = {
          ...standardClub,
          'Club Distinguished Status': status,
        }
        expect(builder.isDistinguished(club)).toBe(refIsDistinguished(club))
      }
    })
  })

  // ---------- isDistinguished letter codes (#1120) ----------
  describe('isDistinguished letter codes (#1120)', () => {
    // Live dashboard CSVs carry single-letter codes, not words.
    // Fixture deliberately fails the DCP heuristic (2 goals, no growth)
    // so only the status field can make it distinguished.
    const baseClub: ScrapedRecord = {
      'Club Number': '4444',
      'Club Name': 'Code Club',
      'Active Members': '15',
      'Mem. Base': '15',
      'Goals Met': '2',
      CSP: 'Yes',
    }

    it.each(['D', 'S', 'P', 'M'])(
      'counts live status code %s as distinguished',
      code => {
        expect(
          builder.isDistinguished({
            ...baseClub,
            'Club Distinguished Status': code,
          })
        ).toBe(true)
      }
    )

    it('does not treat operational status values as distinguished', () => {
      for (const value of ['Active', 'Low', 'Suspended', 'Ineligible']) {
        expect(
          builder.isDistinguished({
            ...baseClub,
            'Club Distinguished Status': value,
          })
        ).toBe(false)
      }
    })

    it('still ignores empty and none-like values', () => {
      for (const value of ['', 'None', 'N/A']) {
        expect(
          builder.isDistinguished({
            ...baseClub,
            'Club Distinguished Status': value,
          })
        ).toBe(false)
      }
    })
  })

  // ---------- calculateDistinguishedTotal equivalence ----------
  describe('calculateDistinguishedTotal equivalence', () => {
    it('should match reference for mixed clubs', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [
          standardClub,
          altFieldClub,
          lowMembershipClub,
          presidentsDistClub,
        ],
      }
      expect(builder.calculateDistinguishedTotal(district)).toBe(
        refCalculateDistinguishedTotal(district)
      )
    })
  })

  // ---------- calculateClubHealthCounts equivalence ----------
  describe('calculateClubHealthCounts equivalence', () => {
    it('should match reference for mixed clubs', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [
          standardClub,
          altFieldClub,
          lowMembershipClub,
          presidentsDistClub,
        ],
      }
      expect(builder.calculateClubHealthCounts(district)).toEqual(
        refCalculateClubHealthCounts(district)
      )
    })

    it('club health counts should sum to total', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [
          standardClub,
          altFieldClub,
          lowMembershipClub,
          presidentsDistClub,
        ],
      }
      const counts = builder.calculateClubHealthCounts(district)
      expect(
        counts.thriving + counts.vulnerable + counts.interventionRequired
      ).toBe(counts.total)
    })

    it('classifies a 3-goal club in June as vulnerable, not thriving (#1120)', () => {
      // The C3 audit disagreement fixture: the legacy `dcpGoals > 0` rule
      // counted this club thriving; the §5.3 June checkpoint requires 5 goals.
      const district: DistrictStatisticsInput = {
        districtId: '61',
        asOfDate: '2026-06-15',
        clubPerformance: [
          {
            'Club Number': '1111',
            'Club Name': 'June Three Goals',
            'Active Members': '25',
            'Mem. Base': '20',
            'Goals Met': '3',
            CSP: 'Yes',
          },
        ],
      }
      expect(builder.calculateClubHealthCounts(district)).toEqual({
        total: 1,
        thriving: 0,
        vulnerable: 1,
        interventionRequired: 0,
      })
    })

    it('does not count a CSP-less club as thriving (#1120)', () => {
      const district: DistrictStatisticsInput = {
        districtId: '61',
        asOfDate: '2026-06-15',
        clubPerformance: [
          {
            'Club Number': '2222',
            'Club Name': 'No CSP',
            'Active Members': '25',
            'Mem. Base': '20',
            'Goals Met': '9',
            CSP: 'No',
          },
        ],
      }
      expect(builder.calculateClubHealthCounts(district)).toEqual({
        total: 1,
        thriving: 0,
        vulnerable: 1,
        interventionRequired: 0,
      })
    })

    it('treats a missing CSP field as submitted (historical data)', () => {
      const district: DistrictStatisticsInput = {
        districtId: '61',
        asOfDate: '2024-06-15',
        clubPerformance: [
          {
            'Club Number': '3333',
            'Club Name': 'Pre-CSP Era',
            'Active Members': '25',
            'Mem. Base': '20',
            'Goals Met': '6',
          },
        ],
      }
      expect(builder.calculateClubHealthCounts(district)).toEqual({
        total: 1,
        thriving: 1,
        vulnerable: 0,
        interventionRequired: 0,
      })
    })
  })

  // ---------- build() complete equivalence ----------
  describe('build() complete equivalence', () => {
    it('should produce TimeSeriesDataPoint matching reference', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-06-15',
        clubPerformance: [standardClub, altFieldClub, lowMembershipClub],
      }
      const result = builder.build('2024-06-15_42', district)

      expect(result.date).toBe('2024-06-15')
      expect(result.snapshotId).toBe('2024-06-15_42')
      expect(result.membership).toBe(refCalculateTotalMembership(district))
      expect(result.payments).toBe(refCalculateTotalPayments(district))
      expect(result.dcpGoals).toBe(refCalculateTotalDCPGoals(district))
      expect(result.distinguishedTotal).toBe(
        refCalculateDistinguishedTotal(district)
      )
      expect(result.clubCounts).toEqual(refCalculateClubHealthCounts(district))
    })

    it('should handle empty clubPerformance', () => {
      const district: DistrictStatisticsInput = {
        districtId: 'F',
        asOfDate: '2024-01-01',
        clubPerformance: [],
      }
      const result = builder.build('2024-01-01_F', district)

      expect(result.membership).toBe(0)
      expect(result.payments).toBe(0)
      expect(result.dcpGoals).toBe(0)
      expect(result.distinguishedTotal).toBe(0)
      expect(result.clubCounts).toEqual({
        total: 0,
        thriving: 0,
        vulnerable: 0,
        interventionRequired: 0,
      })
    })

    it('should use membership.total when provided', () => {
      const district: DistrictStatisticsInput = {
        districtId: '101',
        asOfDate: '2024-01-01',
        membership: { total: 999 },
        clubPerformance: [standardClub],
      }
      const result = builder.build('2024-01-01_101', district)
      expect(result.membership).toBe(999)
    })

    it('all computed values should be non-negative', () => {
      const district: DistrictStatisticsInput = {
        districtId: '42',
        asOfDate: '2024-01-01',
        clubPerformance: [standardClub, lowMembershipClub],
      }
      const result = builder.build('2024-01-01_42', district)

      expect(result.membership).toBeGreaterThanOrEqual(0)
      expect(result.payments).toBeGreaterThanOrEqual(0)
      expect(result.dcpGoals).toBeGreaterThanOrEqual(0)
      expect(result.distinguishedTotal).toBeGreaterThanOrEqual(0)
      expect(result.clubCounts.total).toBeGreaterThanOrEqual(0)
    })
  })
})
