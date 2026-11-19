import { describe, expect, it } from 'vitest'
import {
  ReinstatableClubsSchema,
  SUSPENDED_CLUBS_FORMAT,
  type ClosedClubNameIndex,
  type SuspendedClubs,
} from '@taverns-red/shared-contracts'

import { buildReinstatableClubs } from '../ReinstatableClubsBuilder.js'

/**
 * #3007 phase 2: the per-date reinstatable-clubs list, built from the date's
 * suspended-clubs list and the closed-club index. The rule itself
 * (`classifyReinstatement`) is tested in analytics-core; these tests cover how
 * its inputs are gathered and its output shaped.
 *
 * Real District 61 clubs, as read from the CDN on 2026-11-18, name the cases.
 */

const SNAPSHOT = '2026-11-17'

const suspendedList = (
  districts: SuspendedClubs['districts']
): SuspendedClubs => ({
  _format: SUSPENDED_CLUBS_FORMAT,
  snapshotDate: SNAPSHOT,
  programYear: { start: '2026-07-01', end: '2027-06-30' },
  districts,
})

const closedIndex = (
  programYears: ClosedClubNameIndex['programYears']
): ClosedClubNameIndex => ({
  _format: { version: '1.0.0', type: 'closed-club-name-index' },
  asOf: SNAPSHOT,
  totalClubs: 0,
  programYears,
})

const D61_SUSPENDED = suspendedList({
  '61': [
    {
      clubNumber: '1849755',
      clubName: 'Toastmasters At St. Lawrence College',
      division: 'A',
      area: '01',
      suspendDate: '2026-09-30',
    },
  ],
  '83': [],
})

const D61_CLOSED = closedIndex({
  '2024-2025': {
    '61': [
      ['1314924', 'Maitres Toastmasters', '2025-03-31'],
      ['3492', 'Sandy Hill Club', '2025-03-30'],
    ],
  },
  '2025-2026': {
    '61': [['3475582', "Tunney's Toastmasters", '2026-06-30']],
  },
})

describe('buildReinstatableClubs (#3007 phase 2)', () => {
  it('lists a suspended club with the rule result and its place', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.districts['61']![0]).toEqual({
      clubNumber: '1849755',
      clubName: 'Toastmasters At St. Lawrence College',
      division: 'A',
      area: '01',
      status: 'suspended',
      suspendDate: '2026-09-30',
      oldestPeriod: false,
      addsToBase: true,
      reason: 'suspended_sept30_october_cycle',
    })
  })

  it('lists a closed club inside the four-period window, flagging the oldest', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    const closed = out.districts['61']!.filter(c => c.status === 'closed')
    const maitres = closed.find(c => c.clubNumber === '1314924')
    expect(maitres).toEqual({
      clubNumber: '1314924',
      clubName: 'Maitres Toastmasters',
      status: 'closed',
      lastSeen: '2025-03-31',
      oldestPeriod: true,
      addsToBase: false,
      reason: 'closed_does_not_add',
    })
  })

  it('leaves out a closed club that is outside the window', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    const numbers = out.districts['61']!.map(c => c.clubNumber)
    expect(numbers).not.toContain('3492')
  })

  it('puts suspended clubs first, then closed clubs, newest closure first', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.districts['61']!.map(c => c.clubNumber)).toEqual([
      '1849755',
      '3475582',
      '1314924',
    ])
  })

  it('keeps a district with nothing to list as a measured zero', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.districts['83']).toEqual([])
  })

  it('leaves out a district whose suspended list was not read (unknown, not zero)', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: suspendedList({ '83': [] }),
      closed: D61_CLOSED,
    })
    expect(out.districts).not.toHaveProperty('61')
    expect(out.districts['83']).toEqual([])
  })

  it('lists a club once when the suspended list and the closed index both have it', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: closedIndex({
        '2026-2027': {
          '61': [
            ['1849755', 'Toastmasters At St. Lawrence College', '2026-11-01'],
          ],
        },
      }),
    })
    const rows = out.districts['61']!.filter(c => c.clubNumber === '1849755')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('suspended')
  })

  it('stamps the snapshot date, base program year and format, and passes the writer schema', () => {
    const out = buildReinstatableClubs({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.snapshotDate).toBe(SNAPSHOT)
    expect(out.baseProgramYear).toBe('2026-2027')
    expect(ReinstatableClubsSchema.safeParse(out).success).toBe(true)
  })

  describe('a club suspended in the previous program year (the July to September window)', () => {
    // TI drops a Mar 31 suspension from the roster at the July rollover, so
    // the closed index has it with lastSeen 2026-06-30. By the FAQ it is still
    // suspended until Oct 1, and reinstating it before then adds to the base.
    const previous = suspendedList({
      '61': [
        {
          clubNumber: '3475582',
          clubName: "Tunney's Toastmasters",
          division: 'B',
          area: '22',
          suspendDate: '2026-03-31',
        },
      ],
    })

    it('before Oct 1 it is listed as suspended and adds to the base', () => {
      const out = buildReinstatableClubs({
        snapshotDate: '2026-08-15',
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: previous,
      })
      const row = out.districts['61']!.find(c => c.clubNumber === '3475582')
      expect(row).toMatchObject({
        status: 'suspended',
        suspendDate: '2026-03-31',
        division: 'B',
        area: '22',
        addsToBase: true,
        reason: 'suspended_mar31_before_oct1',
      })
    })

    it('from Oct 1 it has closed, so it is listed as closed and does not add', () => {
      const out = buildReinstatableClubs({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: previous,
      })
      const row = out.districts['61']!.find(c => c.clubNumber === '3475582')
      expect(row).toMatchObject({
        status: 'closed',
        lastSeen: '2026-06-30',
        addsToBase: false,
        reason: 'closed_does_not_add',
      })
    })
  })
})
