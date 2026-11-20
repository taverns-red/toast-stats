import { describe, expect, it } from 'vitest'

import {
  LEGACY_SUSPENSION_DEADLINES_EXPIRES,
  LEGACY_SUSPENSION_DEADLINES_FORMAT,
  LEGACY_SUSPENSION_DEADLINES_PATH,
  LegacySuspensionDeadlinesSchema,
  type LegacySuspensionDeadlines,
} from '../index.js'

/**
 * #3103 — `config/legacy-suspension-deadlines.json`: the suspension deadline
 * of clubs suspended before TI's suspend date reached our data (2025-07-31),
 * derived once from the 2024-25 monthly Club Status history. The five-period
 * rule reads it for closed clubs with no TI date. It stops mattering on
 * 2027-10-01, when a Mar 31 2025 suspension reaches period 6.
 */
const FILE: LegacySuspensionDeadlines = {
  _format: LEGACY_SUSPENSION_DEADLINES_FORMAT,
  generatedAt: '2026-11-21T12:00:00.000Z',
  expires: '2027-10-01',
  sourceDates: ['2024-09-30', '2025-03-31'],
  rowCount: 2,
  rowsSha256: 'a'.repeat(64),
  rows: { '3778': '2025-03-31', '1314924': '2024-09-30' },
}

describe('LegacySuspensionDeadlinesSchema (#3103)', () => {
  it('names its path, format and expiry', () => {
    expect(LEGACY_SUSPENSION_DEADLINES_PATH).toBe(
      'config/legacy-suspension-deadlines.json'
    )
    expect(LEGACY_SUSPENSION_DEADLINES_FORMAT).toEqual({
      version: '1.0.0',
      type: 'legacy-suspension-deadlines',
    })
    expect(LEGACY_SUSPENSION_DEADLINES_EXPIRES).toBe('2027-10-01')
  })

  it('accepts a well-formed file', () => {
    expect(LegacySuspensionDeadlinesSchema.safeParse(FILE).success).toBe(true)
  })

  it('rejects a row count that does not match the rows', () => {
    expect(
      LegacySuspensionDeadlinesSchema.safeParse({ ...FILE, rowCount: 3 })
        .success
    ).toBe(false)
  })

  it('rejects a deadline that is not an ISO date', () => {
    expect(
      LegacySuspensionDeadlinesSchema.safeParse({
        ...FILE,
        rows: { '3778': '03/31/2025', '1314924': '2024-09-30' },
      }).success
    ).toBe(false)
  })

  it('rejects a checksum that is not 64 hex characters', () => {
    expect(
      LegacySuspensionDeadlinesSchema.safeParse({ ...FILE, rowsSha256: 'x' })
        .success
    ).toBe(false)
  })

  it('requires the expiry', () => {
    const { expires: _e, ...rest } = FILE
    expect(LegacySuspensionDeadlinesSchema.safeParse(rest).success).toBe(false)
  })
})
