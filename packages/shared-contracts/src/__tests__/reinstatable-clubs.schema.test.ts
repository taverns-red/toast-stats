import { describe, expect, it } from 'vitest'

import {
  REINSTATABLE_CLUBS_FILE_NAME,
  REINSTATABLE_CLUBS_FORMAT,
  ReinstatableClubsSchema,
  type ReinstatableClubs,
} from '../index.js'

/**
 * #3007 — `snapshots/{date}/reinstatable-clubs.json`: suspended and closed
 * clubs that can still be reinstated, per district, for the Club Growth
 * page's "Can reinstate" section. The rule that fills `oldestPeriod`,
 * `addsToBase` and `reason` is `classifyReinstatement` in analytics-core.
 *
 * Presence carries meaning, as in suspended-clubs.json (#1757): no file for
 * a date = unknown for every district; a district key absent = unknown for
 * that district; `[]` = a measured zero.
 */
const FILE: ReinstatableClubs = {
  _format: REINSTATABLE_CLUBS_FORMAT,
  snapshotDate: '2026-11-17',
  baseProgramYear: '2026-2027',
  districts: {
    '61': [
      {
        clubNumber: '1380016',
        clubName: 'Example Suspended Club',
        division: 'C',
        area: '33',
        status: 'suspended',
        suspendDate: '2026-10-01',
        oldestPeriod: false,
        addsToBase: true,
        reason: 'suspended_sept30_october_cycle',
      },
      {
        clubNumber: '875053',
        clubName: 'Example Closed Club',
        status: 'closed',
        lastSeen: '2025-03-31',
        oldestPeriod: true,
        addsToBase: false,
        reason: 'closed_does_not_add',
      },
    ],
    '83': [],
  },
}

const clone = (): ReinstatableClubs =>
  JSON.parse(JSON.stringify(FILE)) as ReinstatableClubs

describe('ReinstatableClubsSchema (#3007)', () => {
  it('names its file and stamps its format', () => {
    expect(REINSTATABLE_CLUBS_FILE_NAME).toBe('reinstatable-clubs.json')
    expect(REINSTATABLE_CLUBS_FORMAT).toEqual({
      version: '1.0.0',
      type: 'reinstatable-clubs',
    })
  })

  it('accepts a suspended row and a closed row, with division and area optional', () => {
    expect(ReinstatableClubsSchema.safeParse(FILE).success).toBe(true)
  })

  it('accepts a measured zero for a district', () => {
    expect(
      ReinstatableClubsSchema.safeParse({
        ...FILE,
        districts: { '61': [] },
      }).success
    ).toBe(true)
  })

  it('rejects the wrong format type', () => {
    const f = clone()
    ;(f._format as { type: string }).type = 'suspended-clubs'
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects a status that is neither suspended nor closed', () => {
    const f = clone()
    ;(f.districts['61']![0] as { status: string }).status = 'low'
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects a suspended row without a suspend date', () => {
    const f = clone()
    delete f.districts['61']![0]!.suspendDate
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects a closed row without a last-seen date', () => {
    const f = clone()
    delete f.districts['61']![1]!.lastSeen
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it.each(['10/01/2026', '2026-10-1', ''])('rejects the date "%s"', d => {
    const f = clone()
    f.districts['61']![0]!.suspendDate = d
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects an empty reason code', () => {
    const f = clone()
    f.districts['61']![0]!.reason = ''
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects a missing flag', () => {
    const f = clone()
    delete (f.districts['61']![0] as { addsToBase?: boolean }).addsToBase
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('is strict: a person field can never ride along on a row', () => {
    const f = clone()
    ;(f.districts['61']![0] as Record<string, unknown>).presidentName = 'X'
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('is strict at the top level', () => {
    expect(
      ReinstatableClubsSchema.safeParse({ ...FILE, extra: 1 }).success
    ).toBe(false)
  })

  it('requires the base program year as YYYY-YYYY', () => {
    expect(
      ReinstatableClubsSchema.safeParse({ ...FILE, baseProgramYear: '2026' })
        .success
    ).toBe(false)
  })

  it.each(['2026-2030', '2026-2026', '2027-2026'])(
    'rejects the base program year "%s": the end year is the start year plus one (#3011)',
    baseProgramYear => {
      expect(
        ReinstatableClubsSchema.safeParse({ ...FILE, baseProgramYear }).success
      ).toBe(false)
    }
  )

  it('rejects a suspended row that also carries a last-seen date (#3011)', () => {
    const f = clone()
    f.districts['61']![0]!.lastSeen = '2025-03-31'
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })

  it('rejects a closed row that also carries a suspend date (#3011)', () => {
    const f = clone()
    f.districts['61']![1]!.suspendDate = '2026-10-01'
    expect(ReinstatableClubsSchema.safeParse(f).success).toBe(false)
  })
})
