import { describe, it, expect } from 'vitest'
import type { SnapshotDiff } from '@taverns-red/shared-contracts'
import { clubNameInDiff, narrowDiffToClub } from '../changesClubFilter'

/* #2452 — What Changed's ?club= filter. One club's slice of a district diff:
   its events and its per-club rows, matched on the normalized club number
   (the club page's id and the snapshot's id can differ in zero-padding). */

const ag = (from: number, to: number) => ({ from, to, delta: to - from })

const clubRow = (clubId: string, clubName: string) => ({
  clubId,
  clubName,
  divisionId: 'A',
  areaId: '1',
  membership: ag(20, 21),
  payments: ag(20, 21),
  dcpGoals: ag(3, 4),
  distinguishedFrom: '',
  distinguishedTo: '',
  distinguishedChanged: false,
})

function diff(): SnapshotDiff {
  return {
    districtId: '61',
    from: { date: '2026-08-11' },
    to: { date: '2026-10-31' },
    dayCount: 81,
    totals: {
      membership: ag(2700, 2742),
      payments: ag(5700, 5749),
      clubCount: ag(161, 162),
      distinguished: ag(49, 50),
    },
    clubs: {
      bothPresent: [
        clubRow('00002959', 'Club Alpha'),
        clubRow('7238597', 'Club Beta'),
      ],
      onlyInFrom: [
        {
          clubId: '111',
          clubName: 'Gone Club',
          divisionId: 'B',
          areaId: '2',
        },
      ],
      onlyInTo: [
        {
          clubId: '28680300',
          clubName: 'New Club',
          divisionId: 'C',
          areaId: '3',
        },
      ],
    },
    events: [
      {
        category: 'membership',
        clubId: '00002959',
        clubName: 'Club Alpha',
        label: 'Club Alpha gained 1 member',
        magnitude: 1,
      },
      {
        category: 'membership',
        clubId: '7238597',
        clubName: 'Club Beta',
        label: 'Club Beta gained 1 member',
        magnitude: 1,
      },
      {
        category: 'dcp-goals',
        clubId: '2959',
        clubName: 'Club Alpha',
        label: 'Club Alpha earned 1 DCP goal',
        magnitude: 1,
      },
      {
        category: 'division-status',
        clubId: '',
        clubName: '',
        divisionId: 'G',
        entityName: 'Division G',
        label: 'Division G moved to Select Distinguished',
        magnitude: 1,
      },
      {
        category: 'club-added',
        clubId: '28680300',
        clubName: 'New Club',
        label: 'New Club (Active) joined the roster',
        magnitude: 1,
      },
    ],
  }
}

describe('narrowDiffToClub (#2452)', () => {
  it("keeps only the club's events, matching across zero-padding", () => {
    const narrowed = narrowDiffToClub(diff(), '2959')
    expect(narrowed.events.map(e => e.label)).toEqual([
      'Club Alpha gained 1 member',
      'Club Alpha earned 1 DCP goal',
    ])
  })

  it('drops district-level events (division/area) that name no club', () => {
    const narrowed = narrowDiffToClub(diff(), '00002959')
    expect(narrowed.events.some(e => e.category === 'division-status')).toBe(
      false
    )
  })

  it('narrows the per-club rows too, so an export matches the filtered view', () => {
    const narrowed = narrowDiffToClub(diff(), '28680300')
    expect(narrowed.clubs.bothPresent).toEqual([])
    expect(narrowed.clubs.onlyInFrom).toEqual([])
    expect(narrowed.clubs.onlyInTo.map(c => c.clubName)).toEqual(['New Club'])
  })

  it('leaves the district totals alone (the KPI tiles stay district-wide)', () => {
    const d = diff()
    expect(narrowDiffToClub(d, '2959').totals).toBe(d.totals)
  })

  it('returns an empty slice for a club the diff does not know', () => {
    const narrowed = narrowDiffToClub(diff(), '999999')
    expect(narrowed.events).toEqual([])
    expect(narrowed.clubs.bothPresent).toEqual([])
  })

  it('never matches the empty club id of a district-level event', () => {
    expect(narrowDiffToClub(diff(), '').events).toEqual([])
  })
})

describe('clubNameInDiff (#2452)', () => {
  it('names a club from its per-club row', () => {
    expect(clubNameInDiff(diff(), '7238597')).toBe('Club Beta')
  })

  it('names a club that only appears on one side of the pair', () => {
    expect(clubNameInDiff(diff(), '111')).toBe('Gone Club')
    expect(clubNameInDiff(diff(), '28680300')).toBe('New Club')
  })

  it('matches across zero-padding', () => {
    expect(clubNameInDiff(diff(), '2959')).toBe('Club Alpha')
  })

  it('is null for a club the diff does not know', () => {
    expect(clubNameInDiff(diff(), '999999')).toBeNull()
  })
})
