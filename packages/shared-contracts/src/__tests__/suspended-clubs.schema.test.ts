import { describe, expect, it } from 'vitest'

import {
  SUSPENDED_CLUBS_FILE_NAME,
  SUSPENDED_CLUBS_FORMAT,
  SuspendedClubsSchema,
  type SuspendedClubs,
} from '../index.js'

/**
 * #1953 (epic #1781) — `snapshots/{date}/suspended-clubs.json`, the per-club
 * list behind the rankings row's `suspendedClubs` count, for the Club Growth
 * funnel's Suspended stage (#1794).
 *
 * Presence carries meaning (#1757): no file for a date = unknown for every
 * district; a district key absent = unknown for that district; `[]` = a
 * measured zero.
 *
 * The rows below are verbatim from staging
 * raw-csv/2026-10-11/district-83/district-performance.csv (`Susp 10/01/26`).
 */
const FILE: SuspendedClubs = {
  _format: SUSPENDED_CLUBS_FORMAT,
  snapshotDate: '2026-10-11',
  programYear: { start: '2026-07-01', end: '2027-06-30' },
  districts: {
    '61': [],
    '83': [
      {
        clubNumber: '1380016',
        clubName: 'Travelers Toastmasters',
        division: 'C',
        area: '33',
        suspendDate: '2026-10-01',
      },
    ],
  },
}

describe('SuspendedClubsSchema (#1953)', () => {
  it('parses a recorded-shape file, keeping a measured-zero district as []', () => {
    const parsed = SuspendedClubsSchema.parse(FILE)
    expect(parsed).toEqual(FILE)
    expect(parsed.districts['61']).toEqual([])
    expect(SUSPENDED_CLUBS_FILE_NAME).toBe('suspended-clubs.json')
  })

  it('rejects a suspendDate that is not ISO YYYY-MM-DD', () => {
    const bad = structuredClone(FILE)
    bad.districts['83']![0]!.suspendDate = '10/01/26'
    expect(SuspendedClubsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects any extra row field — public club facts only, never person data', () => {
    const bad = structuredClone(FILE) as unknown as {
      districts: Record<string, Array<Record<string, unknown>>>
    }
    bad.districts['83']![0]!.contactEmail = 'someone@example.com'
    expect(SuspendedClubsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a file stamped with another artifact type', () => {
    const bad = { ...FILE, _format: { version: '1.0.0', type: 'other' } }
    expect(SuspendedClubsSchema.safeParse(bad).success).toBe(false)
  })
})
