import { describe, expect, it } from 'vitest'
import {
  ReinstatableClubsSchema,
  SUSPENDED_CLUBS_FORMAT,
  type ClosedClubNameIndex,
  type ReinstatableClubs,
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

/** Club numbers of one district, in file order. */
const numbers = (out: ReinstatableClubs, districtId: string): string[] =>
  out.districts[districtId]!.map(c => c.clubNumber)

/** The builder, for cases whose list is known (it returns null when not). */
function known(
  input: Parameters<typeof buildReinstatableClubs>[0]
): ReinstatableClubs {
  const out = buildReinstatableClubs(input)
  if (out === null) throw new Error('expected a known list, got null')
  return out
}

describe('buildReinstatableClubs (#3007 phase 2)', () => {
  it('lists a suspended club with the rule result and its place', () => {
    const out = known({
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
      inactivePeriod: 1,
      lastChanceBy: '2029-03-31',
    })
  })

  it('lists a closed club with no suspension date from lastSeen bounds, with no period (#3103)', () => {
    const out = known({
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
      oldestPeriod: false,
      addsToBase: false,
      reason: 'closed_does_not_add',
    })
  })

  it('leaves out a closed club past its fifth inactive period (#3103)', () => {
    const out = known({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: closedIndex({
        ...D61_CLOSED.programYears,
        '2023-2024': { '61': [['9000006', 'Period Six Club', '2024-06-30']] },
      }),
    })
    const numbers = out.districts['61']!.map(c => c.clubNumber)
    expect(numbers).toContain('3492')
    expect(numbers).not.toContain('9000006')
  })

  it('puts suspended clubs first, then closed clubs, newest closure first', () => {
    const out = known({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.districts['61']!.map(c => c.clubNumber)).toEqual([
      '1849755',
      '3475582',
      '1314924',
      '3492',
    ])
  })

  it('keeps a district with nothing to list as a measured zero', () => {
    const out = known({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.districts['83']).toEqual([])
  })

  it('leaves out a district whose suspended list was not read (unknown, not zero)', () => {
    const out = known({
      snapshotDate: SNAPSHOT,
      suspended: suspendedList({ '83': [] }),
      closed: D61_CLOSED,
    })
    expect(out.districts).not.toHaveProperty('61')
    expect(out.districts['83']).toEqual([])
  })

  it('lists a club once when the suspended list and the closed index both have it', () => {
    const out = known({
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
    const out = known({
      snapshotDate: SNAPSHOT,
      suspended: D61_SUSPENDED,
      closed: D61_CLOSED,
    })
    expect(out.snapshotDate).toBe(SNAPSHOT)
    expect(out.baseProgramYear).toBe('2026-2027')
    expect(ReinstatableClubsSchema.safeParse(out).success).toBe(true)
  })

  describe('a club suspended in the previous program year (#3064 review)', () => {
    // suspended-clubs.json keeps only suspensions dated in the current program
    // year, so from Jul 1 a club suspended on Mar 31 drops off the date's list.
    // By the FAQ it stays suspended until Oct 1, and reinstating it before
    // then adds to the base. The previous program year's last list (its
    // June 30 snapshot) still has it.
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
    const AUGUST = '2026-08-15'
    const augustSuspended = suspendedList({
      '61': [
        {
          clubNumber: '1849755',
          clubName: 'Toastmasters At St. Lawrence College',
          division: 'A',
          area: '01',
          suspendDate: '2026-07-15',
        },
      ],
    })
    // A club that left the roster in May: newer than Tunney's suspend date.
    const withRecent = closedIndex({
      ...D61_CLOSED.programYears,
      '2025-2026': {
        '61': [
          ['3475582', "Tunney's Toastmasters", '2026-06-30'],
          ['9000001', 'Recent Club', '2026-05-31'],
        ],
      },
    })

    it('before Oct 1, a club the closed index has is listed as suspended and adds to the base', () => {
      const out = known({
        snapshotDate: AUGUST,
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

    it('is listed with the suspended clubs, ahead of every closed club', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: augustSuspended,
        closed: withRecent,
        previousSuspended: previous,
      })
      expect(numbers(out, '61')).toEqual([
        '1849755',
        '3475582',
        '9000001',
        '1314924',
        '3492',
      ])
    })

    it('before Oct 1, a club still on the roster as Suspended is listed (it is in no closed index)', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [] }),
        closed: closedIndex({}),
        previousSuspended: previous,
        roster: new Map([
          ['3475582', { districtId: '61', clubStatus: 'Suspended' }],
        ]),
      })
      expect(out.districts['61']).toEqual([
        {
          clubNumber: '3475582',
          clubName: "Tunney's Toastmasters",
          division: 'B',
          area: '22',
          status: 'suspended',
          suspendDate: '2026-03-31',
          oldestPeriod: false,
          addsToBase: true,
          reason: 'suspended_mar31_before_oct1',
          inactivePeriod: 1,
          lastChanceBy: '2028-09-30',
        },
      ])
    })

    it('a club reinstated since June 30 (Active on the roster) is not listed', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: previous,
        roster: new Map([
          ['3475582', { districtId: '61', clubStatus: 'Active' }],
        ]),
      })
      expect(numbers(out, '61')).not.toContain('3475582')
    })

    it('is listed under the district the roster puts it in on the date', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [], '62': [] }),
        closed: closedIndex({}),
        previousSuspended: previous,
        roster: new Map([
          ['3475582', { districtId: '62', clubStatus: 'suspended' }],
        ]),
      })
      expect(out.districts['61']).toEqual([])
      expect(numbers(out, '62')).toEqual(['3475582'])
    })

    it('from Oct 1 it has closed, so it is listed as closed and does not add', () => {
      const out = known({
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

    it('once closed, its period comes from the suspend date: 2028-09-30 is period 5 (#3103)', () => {
      // Suspended Mar 31 2026: period 1 is Apr-Sep 2026, period 5 Apr-Sep 2028.
      const out = known({
        snapshotDate: '2028-09-30',
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: previous,
      })
      const row = out.districts['61']!.find(c => c.clubNumber === '3475582')
      expect(row).toMatchObject({
        status: 'closed',
        lastSeen: '2026-06-30',
        oldestPeriod: false,
        inactivePeriod: 5,
        lastChanceBy: '2028-09-30',
      })
    })

    it('when the previous list is unknown, Jul 1 to Sep 30, the whole list is unknown: no result', () => {
      // Clubs that left the roster from Apr 1 to Jun 30 may be Mar 31
      // suspensions that still add to the base. Without them an empty
      // district would read as a measured zero (#1757, #3064 review N2).
      for (const date of ['2026-07-01', AUGUST, '2026-09-30']) {
        const out = buildReinstatableClubs({
          snapshotDate: date,
          suspended: suspendedList({ '61': [] }),
          closed: withRecent,
        })
        expect(out, date).toBeNull()
      }
    })

    it('from Oct 1 an unknown previous list withholds nothing', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: withRecent,
      })
      expect(numbers(out, '61')).toEqual([
        '3475582',
        '9000001',
        '1314924',
        '3492',
      ])
    })

    it('a club the roster shows Ineligible was not reinstated, so it is listed (#3064 review N3)', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [] }),
        closed: closedIndex({}),
        previousSuspended: previous,
        roster: new Map([
          ['3475582', { districtId: '61', clubStatus: 'Ineligible' }],
        ]),
      })
      expect(numbers(out, '61')).toEqual(['3475582'])
    })

    it('a club on the roster with no status is listed, not taken as reinstated', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [] }),
        closed: closedIndex({}),
        previousSuspended: previous,
        roster: new Map([['3475582', { districtId: '61' }]]),
      })
      expect(numbers(out, '61')).toEqual(['3475582'])
    })

    it('a club the roster shows Low (it met the renewal) was reinstated', () => {
      const out = known({
        snapshotDate: AUGUST,
        suspended: suspendedList({ '61': [] }),
        closed: closedIndex({}),
        previousSuspended: previous,
        roster: new Map([['3475582', { districtId: '61', clubStatus: 'Low' }]]),
      })
      expect(numbers(out, '61')).toEqual([])
    })
  })

  describe('a Mar 31 suspension from two or three program years back (#3064 review F2)', () => {
    // Real District 61 clubs, read from the CDN: Tunney's Toastmasters and
    // HULL Toastmasters Club were suspended 2026-03-31, are on the
    // 2026-06-30 roster and are gone from the 2026-07-31 one. TI drops a
    // Mar 31 suspension at the July rollover, so lastSeen is 2026-06-30. By
    // the FAQ each closed on Oct 1 2026, which stays inside the four-period
    // window until Sep 30 2028. Only the 2026-06-30 suspended list still has
    // their suspend date; the previous year's list does not.
    const list = (
      snapshotDate: string,
      clubs: SuspendedClubs['districts'][string]
    ): SuspendedClubs => ({
      ...suspendedList({ '61': clubs }),
      snapshotDate,
    })
    const list2026 = list('2026-06-30', [
      {
        clubNumber: '3475582',
        clubName: "Tunney's Toastmasters",
        division: 'B',
        area: '15',
        suspendDate: '2026-03-31',
      },
      {
        clubNumber: '7270199',
        clubName: 'HULL Toastmasters Club',
        division: 'C',
        area: '22',
        suspendDate: '2026-03-31',
      },
    ])
    const list2027 = list('2027-06-30', [])
    const list2028 = list('2028-06-30', [])
    const closed = closedIndex({
      '2025-2026': {
        '61': [
          ['3475582', "Tunney's Toastmasters", '2026-06-30'],
          ['7270199', 'HULL Toastmasters Club', '2026-06-30'],
        ],
      },
    })
    const build = (
      snapshotDate: string,
      previousSuspended: SuspendedClubs,
      olderSuspended: SuspendedClubs[]
    ) =>
      known({
        snapshotDate,
        suspended: suspendedList({ '61': [] }),
        closed,
        previousSuspended,
        olderSuspended,
      })

    for (const date of ['2028-04-01', '2028-06-30']) {
      it(`${date}: two years back, both are listed as closed in period 5 (#3103)`, () => {
        const out = build(date, list2027, [list2026])
        expect(
          out.districts['61']!.map(c => [
            c.clubNumber,
            c.status,
            c.inactivePeriod,
            c.lastChanceBy,
          ])
        ).toEqual([
          ['3475582', 'closed', 5, '2028-09-30'],
          ['7270199', 'closed', 5, '2028-09-30'],
        ])
      })
    }

    for (const date of ['2028-08-01', '2028-09-30']) {
      it(`${date}: three years back, both are still listed in period 5 (#3103)`, () => {
        const out = build(date, list2028, [list2027, list2026])
        expect(numbers(out, '61')).toEqual(['3475582', '7270199'])
        expect(out.districts['61']!.every(c => c.inactivePeriod === 5)).toBe(
          true
        )
      })
    }

    it('2027-10-01: Oct 2027 - Mar 2028 is period 4 (#3103)', () => {
      const out = build('2027-10-01', list2027, [list2026])
      expect(out.districts['61']!.map(c => c.inactivePeriod)).toEqual([4, 4])
    })

    it('2028-10-01: period 6, so neither is listed', () => {
      const out = build('2028-10-01', list2028, [list2027, list2026])
      expect(out.districts['61']).toEqual([])
    })
  })

  describe('five inactive periods: where the suspension comes from (#3103)', () => {
    // report.md §3, District 61 on 2026-11-19. lastSeen is capped at the
    // June 30 program-year artifact, so the suspension comes from TI's
    // suspend date (the suspended lists) or, before 2025-07-31, from the
    // legacy deadlines file built from status history.
    const NOV19 = '2026-11-19'
    const name = (n: string) => `Club ${n}`
    const PERIOD4 = ['3778', '7070084', '7857', '9547']
    const PERIOD5 = ['1314924', '28675862', '3492', '700580', '7852257']
    const closed = closedIndex({
      '2024-2025': {
        '61': [
          ...PERIOD4.map(
            n => [n, name(n), '2025-06-30'] as [string, string, string]
          ),
          ...PERIOD5.map(
            n => [n, name(n), '2025-03-31'] as [string, string, string]
          ),
          ['9000006', 'Period Six Club', '2025-06-30'],
        ],
      },
      '2025-2026': {
        '61': [['1025927', 'Above & Beyond', '2026-04-29']],
      },
    })
    // Fixture map in the shape of config/legacy-suspension-deadlines.json rows.
    const legacy = new Map<string, string>([
      ...PERIOD4.map(n => [n, '2025-03-31'] as [string, string]),
      ...PERIOD5.map(n => [n, '2024-09-30'] as [string, string]),
      // A club last seen 2025-06-30 whose run started at Mar 31 2024.
      ['9000006', '2024-03-31'],
    ])
    const march2026: SuspendedClubs = {
      ...suspendedList({
        '61': [
          {
            clubNumber: '1025927',
            clubName: 'Above & Beyond',
            division: 'D',
            area: '41',
            suspendDate: '2025-09-30',
          },
        ],
      }),
      snapshotDate: '2026-03-31',
    }
    const build = (extra: Partial<Parameters<typeof known>[0]> = {}) =>
      known({
        snapshotDate: NOV19,
        suspended: suspendedList({ '61': [] }),
        closed,
        ...extra,
      })
    const row = (out: ReinstatableClubs, n: string) =>
      out.districts['61']!.find(c => c.clubNumber === n)

    it.each(PERIOD4)(
      'with the legacy map, %s (Mar 31 2025) is period 4, last chance 2027-09-30',
      n => {
        expect(row(build({ legacyDeadlines: legacy }), n)).toMatchObject({
          inactivePeriod: 4,
          lastChanceBy: '2027-09-30',
          oldestPeriod: false,
        })
      }
    )

    it.each(PERIOD5)(
      'with the legacy map, %s (Sept 30 2024) is period 5, last chance 2027-03-31',
      n => {
        expect(row(build({ legacyDeadlines: legacy }), n)).toMatchObject({
          inactivePeriod: 5,
          lastChanceBy: '2027-03-31',
        })
      }
    )

    it('with the legacy map, a period-6 club is left out', () => {
      expect(row(build({ legacyDeadlines: legacy }), '9000006')).toBeUndefined()
    })

    it('without the map, the same clubs are listed with no period or last chance', () => {
      const out = build()
      for (const n of [...PERIOD4, ...PERIOD5]) {
        const r = row(out, n)
        expect(r, n).toBeDefined()
        expect('inactivePeriod' in r!, n).toBe(false)
        expect('lastChanceBy' in r!, n).toBe(false)
      }
      // Its bounds (Oct 2024 at the earliest) keep it, as TI decides.
      expect(row(out, '9000006')).toBeDefined()
    })

    it('a Sept 30 2025 suspension that closed in April gets its TI date from the March 31 list', () => {
      const r = row(build({ marchSuspended: [march2026] }), '1025927')
      expect(r).toMatchObject({
        status: 'closed',
        lastSeen: '2026-04-29',
        inactivePeriod: 3,
        lastChanceBy: '2028-03-31',
        division: 'D',
        area: '41',
      })
    })

    it('without the March 31 list that club has no period', () => {
      const r = row(build(), '1025927')
      expect(r).toBeDefined()
      expect(r!.inactivePeriod).toBeUndefined()
    })

    it('a TI suspend date wins over the legacy map', () => {
      const r = row(
        build({
          marchSuspended: [march2026],
          legacyDeadlines: new Map([['1025927', '2024-09-30']]),
        }),
        '1025927'
      )
      expect(r!.inactivePeriod).toBe(3)
    })

    it('District 61 lists all 22 clubs report.md counts, each with a period', () => {
      const out = known({
        snapshotDate: NOV19,
        suspended: suspendedList({
          '61': ['1849755', '613576', '1269833'].map(n => ({
            clubNumber: n,
            clubName: name(n),
            division: 'A',
            area: '01',
            suspendDate: '2026-09-30',
          })),
        }),
        closed: closedIndex({
          '2024-2025': closed.programYears['2024-2025']!,
          '2025-2026': {
            '61': [
              ['3475582', name('3475582'), '2026-06-30'],
              ['7270199', name('7270199'), '2026-06-30'],
              ...[
                '1025927',
                '2150311',
                '2279948',
                '2285',
                '2708969',
                '4679523',
                '7906623',
                '924107',
              ].map(
                n => [n, name(n), '2026-04-29'] as [string, string, string]
              ),
            ],
          },
        }),
        previousSuspended: {
          ...suspendedList({
            '61': ['3475582', '7270199'].map(n => ({
              clubNumber: n,
              clubName: name(n),
              division: 'B',
              area: '15',
              suspendDate: '2026-03-31',
            })),
          }),
          snapshotDate: '2026-06-30',
        },
        marchSuspended: [
          {
            ...suspendedList({
              '61': [
                '1025927',
                '2150311',
                '2279948',
                '2285',
                '2708969',
                '4679523',
                '7906623',
                '924107',
              ].map(n => ({
                clubNumber: n,
                clubName: name(n),
                division: 'C',
                area: '30',
                suspendDate: '2025-09-30',
              })),
            }),
            snapshotDate: '2026-03-31',
          },
        ],
        legacyDeadlines: legacy,
      })
      const rows = out.districts['61']!
      expect(rows).toHaveLength(22)
      expect(
        rows.reduce<Record<number, number>>((acc, r) => {
          acc[r.inactivePeriod!] = (acc[r.inactivePeriod!] ?? 0) + 1
          return acc
        }, {})
      ).toEqual({ 1: 3, 2: 2, 3: 8, 4: 4, 5: 5 })
      expect(ReinstatableClubsSchema.safeParse(out).success).toBe(true)
    })
  })

  describe('districts', () => {
    it('leaves out district U (clubs not in a district), in any case', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [], U: [], u: [] }),
        closed: closedIndex({
          '2025-2026': { U: [['1', 'Undistricted Club', '2026-06-30']] },
        }),
      })
      expect(Object.keys(out.districts)).toEqual(['61'])
    })

    it('keeps district F, which is a real district', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({
          F: [
            {
              clubNumber: '7777',
              clubName: 'F Club',
              division: 'A',
              area: '1',
              suspendDate: '2026-09-30',
            },
          ],
        }),
        closed: closedIndex({}),
      })
      expect(numbers(out, 'F')).toEqual(['7777'])
    })
  })

  describe('a district Toastmasters retired (#3101)', () => {
    // At the 2026-07-01 rollover TI retired 64 districts (124 among them),
    // and 09 at the 2025-07-01 one. Their closed clubs are listed under the
    // old number, with the date the district was retired. The date's
    // district set is its all-districts-rankings.json.
    const NOW = '2026-11-19'
    const TODAY_DISTRICTS = ['61', '225']
    const nowSuspended = (districts: SuspendedClubs['districts']) => ({
      ...suspendedList(districts),
      snapshotDate: NOW,
    })
    const RETIRED_CLOSED = closedIndex({
      '2024-2025': {
        '09': [['8000009', 'Old Nine Club', '2025-03-31']],
        '61': [['1314924', 'Maitres Toastmasters', '2025-03-31']],
      },
      '2025-2026': {
        '124': [['8000124', 'Old 124 Club', '2026-03-31']],
      },
    })
    const build = (
      extra: Partial<Parameters<typeof buildReinstatableClubs>[0]> = {}
    ) =>
      known({
        snapshotDate: NOW,
        suspended: nowSuspended({ '61': [], '225': [] }),
        closed: { ...RETIRED_CLOSED, asOf: NOW },
        districtIds: TODAY_DISTRICTS,
        ...extra,
      })

    it('lists a closed club of a district retired in 2026 under its old number', () => {
      const out = build()
      expect(out.districts['124']).toEqual([
        {
          clubNumber: '8000124',
          clubName: 'Old 124 Club',
          status: 'closed',
          lastSeen: '2026-03-31',
          oldestPeriod: false,
          addsToBase: false,
          reason: 'closed_does_not_add',
          districtRetiredOn: '2026-07-01',
        },
      ])
    })

    it('dates a district retired in 2025 July 1, 2025, from the data', () => {
      const out = build()
      expect(out.districts['09']!.map(c => c.districtRetiredOn)).toEqual([
        '2025-07-01',
      ])
    })

    it('a June 30 list that still has the district dates it from that year', () => {
      // No 2025-26 closure of district 09, but the 2026-06-30 list has it:
      // it still existed in 2025-26.
      const june = {
        ...suspendedList({
          '09': [
            {
              clubNumber: '8000999',
              clubName: 'June Nine Club',
              division: 'A',
              area: '1',
              suspendDate: '2026-03-31',
            },
          ],
        }),
        snapshotDate: '2026-06-30',
        programYear: { start: '2025-07-01', end: '2026-06-30' },
      }
      const out = build({ previousSuspended: june })
      expect(
        out.districts['09']!.find(c => c.clubNumber === '8000009')
          ?.districtRetiredOn
      ).toBe('2026-07-01')
    })

    it('leaves rows of a district on the date unchanged, with no districtRetiredOn', () => {
      const out = build()
      expect(out.districts['61']).toEqual([
        {
          clubNumber: '1314924',
          clubName: 'Maitres Toastmasters',
          status: 'closed',
          lastSeen: '2025-03-31',
          oldestPeriod: false,
          addsToBase: false,
          reason: 'closed_does_not_add',
        },
      ])
      expect(out.districts['225']).toEqual([])
    })

    it('matches district ids whatever their zero-padding', () => {
      const out = build({ districtIds: ['9', '61', '225'] })
      expect(out.districts).not.toHaveProperty('09')
    })

    it('a district on the date whose suspended list was not read stays unknown, not retired', () => {
      const out = build({ districtIds: ['61', '124', '225'] })
      expect(out.districts).not.toHaveProperty('124')
    })

    it('an empty district set is unusable: no district is taken as retired', () => {
      const out = build({ districtIds: [] })
      expect(Object.keys(out.districts).sort()).toEqual(['225', '61'])
      expect(
        Object.values(out.districts)
          .flat()
          .some(c => 'districtRetiredOn' in c)
      ).toBe(false)
    })

    it('a district set missing a suspended-list key is unusable: no district is taken as retired', () => {
      // 225 is on the suspended list but not in the set: the set is partial,
      // so a district missing from it can't be told retired from not read.
      const out = build({ districtIds: ['61'] })
      expect(Object.keys(out.districts).sort()).toEqual(['225', '61'])
      expect(
        Object.values(out.districts)
          .flat()
          .some(c => 'districtRetiredOn' in c)
      ).toBe(false)
    })

    it('known limit: a retired district with no closure or list row in its last year is dated a year early', () => {
      // District 07 existed in 2025-26 (retired 2026-07-01), but the only
      // sign of it is a 2024-25 closure. The evidence rule dates it from
      // that year. Exact dates need each year's June 30 district set.
      const out = build({
        closed: {
          ...closedIndex({
            '2024-2025': {
              '07': [['8000007', 'Old Seven Club', '2025-03-31']],
            },
          }),
          asOf: NOW,
        },
      })
      expect(out.districts['07']!.map(c => c.districtRetiredOn)).toEqual([
        '2025-07-01',
      ])
    })

    it('without the date’s district set, no district is taken as retired', () => {
      const out = build({ districtIds: undefined })
      expect(Object.keys(out.districts).sort()).toEqual(['225', '61'])
    })

    it('never lists district U as retired', () => {
      const out = build({
        closed: closedIndex({
          '2025-2026': { U: [['1', 'Undistricted Club', '2026-06-30']] },
        }),
      })
      expect(out.districts).not.toHaveProperty('U')
    })

    it('a Mar 31 suspension carried over from a retired district is listed under it, as suspended', () => {
      const AUGUST = '2026-08-15'
      const june = {
        ...suspendedList({
          '124': [
            {
              clubNumber: '8000125',
              clubName: 'Carried 124 Club',
              division: 'C',
              area: '3',
              suspendDate: '2026-03-31',
            },
          ],
        }),
        snapshotDate: '2026-06-30',
        programYear: { start: '2025-07-01', end: '2026-06-30' },
      }
      const out = known({
        snapshotDate: AUGUST,
        suspended: { ...nowSuspended({ '61': [] }), snapshotDate: AUGUST },
        closed: closedIndex({
          '2025-2026': {
            '124': [['8000125', 'Carried 124 Club', '2026-06-30']],
          },
        }),
        previousSuspended: june,
        districtIds: ['61'],
      })
      expect(out.districts['124']).toEqual([
        expect.objectContaining({
          clubNumber: '8000125',
          status: 'suspended',
          suspendDate: '2026-03-31',
          division: 'C',
          area: '3',
          addsToBase: true,
          reason: 'suspended_mar31_before_oct1',
          districtRetiredOn: '2026-07-01',
        }),
      ])
    })

    it('passes the writer schema', () => {
      expect(ReinstatableClubsSchema.safeParse(build()).success).toBe(true)
    })
  })

  describe('division and area of a closed club, from a June 30 suspended list (#3097)', () => {
    // The closed index has no division or area. The June 30 suspended lists
    // the builder already reads do, as at the club's suspension.
    const june = (
      snapshotDate: string,
      clubs: SuspendedClubs['districts'][string]
    ): SuspendedClubs => ({ ...suspendedList({ '61': clubs }), snapshotDate })
    const tunneys = (division: string, area: string) => ({
      clubNumber: '3475582',
      clubName: "Tunney's Toastmasters",
      division,
      area,
      suspendDate: '2026-03-31',
    })
    const row = (out: ReinstatableClubs, clubNumber: string) =>
      out.districts['61']!.find(c => c.clubNumber === clubNumber)

    it('a closed club on the previous June list gets its division and area', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: june('2026-06-30', [tunneys('B', '15')]),
      })
      expect(row(out, '3475582')).toMatchObject({
        status: 'closed',
        division: 'B',
        area: '15',
      })
      expect(ReinstatableClubsSchema.safeParse(out).success).toBe(true)
    })

    it('a closed club on no June list has no division or area keys', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: june('2026-06-30', [tunneys('B', '15')]),
      })
      const maitres = row(out, '1314924')!
      expect(maitres.status).toBe('closed')
      expect('division' in maitres).toBe(false)
      expect('area' in maitres).toBe(false)
      expect(JSON.stringify(out)).not.toContain('undefined')
    })

    it('a June row without a division or area adds no keys', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: june('2026-06-30', [
          {
            clubNumber: '3475582',
            clubName: "Tunney's Toastmasters",
            suspendDate: '2026-03-31',
          },
        ]),
      })
      const club = row(out, '3475582')!
      expect('division' in club).toBe(false)
      expect('area' in club).toBe(false)
    })

    it('a June row from another district (realigned since) adds no division or area', () => {
      const out = known({
        snapshotDate: SNAPSHOT,
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: {
          ...suspendedList({ '86': [tunneys('B', '15')] }),
          snapshotDate: '2026-06-30',
        },
      })
      const club = row(out, '3475582')!
      expect(club.status).toBe('closed')
      expect('division' in club).toBe(false)
      expect('area' in club).toBe(false)
    })

    it('a club on two June lists takes the newest list', () => {
      const out = known({
        snapshotDate: '2027-11-17',
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: june('2027-06-30', [tunneys('C', '22')]),
        olderSuspended: [june('2026-06-30', [tunneys('B', '15')])],
      })
      expect(row(out, '3475582')).toMatchObject({
        division: 'C',
        area: '22',
      })
    })

    it('an older list fills in when the previous list does not have the club', () => {
      const out = known({
        snapshotDate: '2027-11-17',
        suspended: suspendedList({ '61': [] }),
        closed: D61_CLOSED,
        previousSuspended: june('2027-06-30', []),
        olderSuspended: [june('2026-06-30', [tunneys('B', '15')])],
      })
      expect(row(out, '3475582')).toMatchObject({
        division: 'B',
        area: '15',
      })
    })
  })

  describe('the writer schema (#3097)', () => {
    const closedRow = {
      clubNumber: '3475582',
      clubName: "Tunney's Toastmasters",
      status: 'closed',
      lastSeen: '2026-06-30',
      oldestPeriod: false,
      addsToBase: false,
      reason: 'closed_does_not_add',
    }
    const file = (rows: unknown[]) => ({
      _format: { version: '1.0.0', type: 'reinstatable-clubs' },
      snapshotDate: SNAPSHOT,
      baseProgramYear: '2026-2027',
      districts: { '61': rows },
    })

    it('accepts a closed row without division and area (files written before)', () => {
      expect(ReinstatableClubsSchema.safeParse(file([closedRow])).success).toBe(
        true
      )
    })

    it('accepts a closed row with division and area', () => {
      expect(
        ReinstatableClubsSchema.safeParse(
          file([{ ...closedRow, division: 'B', area: '15' }])
        ).success
      ).toBe(true)
    })
  })
})
