/**
 * Unit tests for shared program-year date helpers (#306).
 *
 * Previously duplicated verbatim between BordaCountRankingCalculator
 * (analytics-core) and TransformService (collector-cli).
 */

import { describe, it, expect } from 'vitest'
import {
  parseDateFlexible,
  getProgramYearStartDate,
  parseCharterDateFromStatusField,
  parseSuspendDateFromStatusField,
} from './programYearDates.js'

describe('parseDateFlexible', () => {
  it('parses ISO YYYY-MM-DD as UTC', () => {
    expect(parseDateFlexible('2026-04-15')?.toISOString()).toBe(
      '2026-04-15T00:00:00.000Z'
    )
  })

  it('parses US M/D/YYYY', () => {
    expect(parseDateFlexible('4/15/2026')?.toISOString()).toBe(
      '2026-04-15T00:00:00.000Z'
    )
  })

  it('parses US M/D/YY as 20YY', () => {
    expect(parseDateFlexible('4/15/26')?.toISOString()).toBe(
      '2026-04-15T00:00:00.000Z'
    )
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseDateFlexible('')).toBeNull()
    expect(parseDateFlexible('not a date')).toBeNull()
  })
})

describe('getProgramYearStartDate', () => {
  it('returns July 1 of the same calendar year for a date in/after July', () => {
    expect(getProgramYearStartDate('2025-09-15')?.toISOString()).toBe(
      '2025-07-01T00:00:00.000Z'
    )
  })

  it('returns July 1 of the previous calendar year for a date before July', () => {
    expect(getProgramYearStartDate('2026-04-15')?.toISOString()).toBe(
      '2025-07-01T00:00:00.000Z'
    )
  })

  it('returns null for an unparseable date', () => {
    expect(getProgramYearStartDate('garbage')).toBeNull()
  })
})

describe('parseCharterDateFromStatusField', () => {
  it('extracts the date from a Charter entry', () => {
    expect(
      parseCharterDateFromStatusField('Charter 04/15/26')?.toISOString()
    ).toBe('2026-04-15T00:00:00.000Z')
  })

  it('returns null for a Susp entry', () => {
    expect(parseCharterDateFromStatusField('Susp 09/30/25')).toBeNull()
  })

  it('returns null for empty or non-string input', () => {
    expect(parseCharterDateFromStatusField('')).toBeNull()
    expect(parseCharterDateFromStatusField(null)).toBeNull()
    expect(parseCharterDateFromStatusField(42)).toBeNull()
  })
})

describe('parseSuspendDateFromStatusField (#1497)', () => {
  // Values captured live 2026-08-31 from
  // cdn.taverns.red/snapshots/2026-06-30/district_61.json →
  // data.districtPerformance[]['Charter Date/Suspend Date'].
  // Suspension values carry a LEADING SPACE; charter values do not.
  it('extracts the date from a live Susp entry (leading space and all)', () => {
    expect(
      parseSuspendDateFromStatusField(' Susp 03/31/26')?.toISOString()
    ).toBe('2026-03-31T00:00:00.000Z')
  })

  it('extracts the date from a Susp entry without the leading space', () => {
    expect(
      parseSuspendDateFromStatusField('Susp 09/30/25')?.toISOString()
    ).toBe('2025-09-30T00:00:00.000Z')
  })

  it('matches the prefix case-insensitively', () => {
    expect(
      parseSuspendDateFromStatusField('susp 09/30/25')?.toISOString()
    ).toBe('2025-09-30T00:00:00.000Z')
    expect(
      parseSuspendDateFromStatusField('SUSP 09/30/25')?.toISOString()
    ).toBe('2025-09-30T00:00:00.000Z')
  })

  it('parses a 4-digit year per parseDateFlexible semantics', () => {
    expect(
      parseSuspendDateFromStatusField('Susp 3/1/2026')?.toISOString()
    ).toBe('2026-03-01T00:00:00.000Z')
  })

  it('returns null for a Charter entry (wrong prefix)', () => {
    expect(parseSuspendDateFromStatusField('Charter 04/15/26')).toBeNull()
    expect(parseSuspendDateFromStatusField('Charter 05/22/26')).toBeNull()
  })

  it('returns null for a Susp prefix with no date', () => {
    expect(parseSuspendDateFromStatusField('Susp')).toBeNull()
    expect(parseSuspendDateFromStatusField('Susp ')).toBeNull()
    expect(parseSuspendDateFromStatusField('Susp not a date')).toBeNull()
  })

  it('returns null for empty, missing, or non-string input', () => {
    expect(parseSuspendDateFromStatusField('')).toBeNull()
    expect(parseSuspendDateFromStatusField('   ')).toBeNull()
    expect(parseSuspendDateFromStatusField(undefined)).toBeNull()
    expect(parseSuspendDateFromStatusField(null)).toBeNull()
    expect(parseSuspendDateFromStatusField(42)).toBeNull()
  })
})
