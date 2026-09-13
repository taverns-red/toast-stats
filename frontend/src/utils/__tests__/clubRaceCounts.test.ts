/* #1570 — the /clubs KPI tiles must count each club ONCE, at its top level.
   The artifact's `timeline` is cumulative (a President's club is also counted
   under Select and Distinguished), so reading tiles off it triple-counts.

   Two rulings this file pins:
   - Basis is CURRENT standing (`reached[].current.level`), not the best tier
     ever reached. A club that slips moves tiles but keeps its crossing date
     and its place in the higher tier's "First to reach" list (R-A2).
   - Every reached row lands in exactly ONE bucket, so the tiles always sum to
     `reached.length` — asserted below as an invariant, not observed once. */

import { describe, it, expect } from 'vitest'
import type {
  ClubRaceTier,
  GlobalClubRaceCurrent,
  GlobalClubRaceLevel,
  GlobalClubRaceReached,
  GlobalClubRaceTimelinePoint,
} from '@taverns-red/shared-contracts'
import {
  exclusiveTierCounts,
  stackedRaceTimeline,
  tileTierFor,
  totalRecognised,
} from '../clubRaceCounts'

const standing = (reachedOn: string, rank = 1) => ({
  reachedOn,
  observedAfter: null,
  rank,
})

const current = (level: GlobalClubRaceLevel): GlobalClubRaceCurrent => ({
  level,
  activeMembersLevel: level,
  goalsMet: 7,
  members: 22,
  membershipBase: 20,
  netGrowth: 2,
  aprilRenewals: 22,
  cspSubmitted: true,
  dcpGoalsAchieved: null,
  divisionId: 'A',
  areaId: 'A1',
  country: 'Singapore',
})

const row = (
  over: Partial<GlobalClubRaceReached> & { clubId: string }
): GlobalClubRaceReached => ({
  clubName: `Club ${over.clubId}`,
  districtId: '80',
  current: current('Distinguished'),
  tiers: { Distinguished: standing('2026-07-26') },
  official: null,
  ...over,
})

/** The real triple-counted club on the 2026-09-12 artifact (D80). */
const angMoKio = row({
  clubId: '5193',
  clubName: 'Ang Mo Kio C.C. Mandarin Toastmasters Club',
  current: current('President'),
  tiers: {
    Distinguished: standing('2026-07-26'),
    Select: standing('2026-08-14'),
    President: standing('2026-08-14'),
  },
})

describe('tileTierFor (#1570)', () => {
  it('buckets a club by its CURRENT level, not the best tier it ever reached', () => {
    expect(tileTierFor(angMoKio)).toBe('President')
  })

  it('moves a slipped club down a tile while its crossings stay put', () => {
    const slipped: GlobalClubRaceReached = {
      ...angMoKio,
      current: current('Distinguished'),
    }
    expect(tileTierFor(slipped)).toBe('Distinguished')
    // Crossings are sticky (R-A2) — the util must not touch them.
    expect(slipped.tiers.President?.reachedOn).toBe('2026-08-14')
    expect(slipped.tiers.Select?.reachedOn).toBe('2026-08-14')
  })

  it('falls back to the high-water tier when the club is absent today', () => {
    expect(tileTierFor({ ...angMoKio, current: null })).toBe('President')
  })

  it('falls back to the high-water tier when the club no longer qualifies at all', () => {
    expect(
      tileTierFor({ ...angMoKio, current: current('NotDistinguished') })
    ).toBe('President')
  })

  it('buckets an official-code-only row by the code TI awarded', () => {
    const officialOnly: GlobalClubRaceReached = {
      ...row({ clubId: '999' }),
      current: current('NotDistinguished'),
      tiers: {},
      official: { code: 'S', since: '2026-04-30', observedAfter: null },
    }
    expect(tileTierFor(officialOnly)).toBe('Select')
  })

  it('returns null only for a row that reached nothing and holds no code', () => {
    expect(
      tileTierFor({
        ...row({ clubId: '000' }),
        current: current('NotDistinguished'),
        tiers: {},
        official: null,
      })
    ).toBeNull()
  })
})

describe('exclusiveTierCounts (#1570)', () => {
  it('counts a club that appears in three tier lists exactly once', () => {
    const counts = exclusiveTierCounts([angMoKio])
    expect(counts).toEqual({
      Distinguished: 0,
      Select: 0,
      President: 1,
      Smedley: 0,
    })
  })

  it('reproduces the 2026-09-12 artifact: 31 / 1 / 3 / 0 summing to 35', () => {
    const rows: GlobalClubRaceReached[] = [
      ...Array.from({ length: 31 }, (_, i) =>
        row({ clubId: `d${i}`, current: current('Distinguished') })
      ),
      row({
        clubId: 's0',
        current: current('Select'),
        tiers: {
          Distinguished: standing('2026-07-26'),
          Select: standing('2026-08-14'),
        },
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        row({
          clubId: `p${i}`,
          current: current('President'),
          tiers: {
            Distinguished: standing('2026-07-26'),
            Select: standing('2026-08-14'),
            President: standing('2026-08-14'),
          },
        })
      ),
    ]
    expect(exclusiveTierCounts(rows)).toEqual({
      Distinguished: 31,
      Select: 1,
      President: 3,
      Smedley: 0,
    })
    expect(totalRecognised(exclusiveTierCounts(rows))).toBe(rows.length)
  })

  it('INVARIANT: the tiles always sum to reached.length', () => {
    const fixtures: GlobalClubRaceReached[][] = [
      [],
      [angMoKio],
      [angMoKio, { ...angMoKio, clubId: 'x', current: current('Smedley') }],
      [
        { ...angMoKio, clubId: 'absent', current: null },
        { ...angMoKio, clubId: 'lapsed', current: current('NotDistinguished') },
        {
          ...row({ clubId: 'official' }),
          current: current('NotDistinguished'),
          tiers: {},
          official: { code: 'M', since: '2026-04-30', observedAfter: null },
        },
      ],
    ]
    for (const rows of fixtures) {
      expect(totalRecognised(exclusiveTierCounts(rows))).toBe(rows.length)
    }
  })
})

describe('stackedRaceTimeline (#1570)', () => {
  const timeline: GlobalClubRaceTimelinePoint[] = [
    {
      date: '2026-07-26',
      Distinguished: 1,
      Select: 0,
      President: 0,
      Smedley: 0,
      official: 0,
    },
    {
      date: '2026-08-14',
      Distinguished: 20,
      Select: 4,
      President: 3,
      Smedley: 1,
      official: 0,
    },
    {
      date: '2026-09-12',
      Distinguished: 35,
      Select: 4,
      President: 3,
      Smedley: 0,
      official: 0,
    },
  ]
  const counts: Record<ClubRaceTier, number> = {
    Distinguished: 31,
    Select: 1,
    President: 3,
    Smedley: 0,
  }

  it('derives exclusive bands arithmetically from the cumulative points', () => {
    const stacked = stackedRaceTimeline(timeline, counts)
    expect(stacked[1]).toEqual({
      date: '2026-08-14',
      Distinguished: 16, // 20 − 4
      Select: 1, //  4 − 3
      President: 2, //  3 − 1
      Smedley: 1,
    })
  })

  it('keeps the bands summing to the cumulative total at every earlier point', () => {
    const stacked = stackedRaceTimeline(timeline, counts)
    for (const [i, point] of stacked.slice(0, -1).entries()) {
      const total =
        point.Distinguished + point.Select + point.President + point.Smedley
      expect(total).toBe(timeline[i].Distinguished)
    }
  })

  it('anchors the FINAL point to the current-standing tile figures', () => {
    const stacked = stackedRaceTimeline(timeline, counts)
    expect(stacked[stacked.length - 1]).toEqual({
      date: '2026-09-12',
      ...counts,
    })
  })

  it('anchors the final point even when the club mix has drifted from the crossings', () => {
    // A President's club slipped back to Distinguished: the high-water
    // timeline still says President 3, the tiles say 2.
    const drifted: Record<ClubRaceTier, number> = {
      Distinguished: 32,
      Select: 1,
      President: 2,
      Smedley: 0,
    }
    const stacked = stackedRaceTimeline(timeline, drifted)
    const last = stacked[stacked.length - 1]
    expect(last.President).toBe(2)
    expect(
      last.Distinguished + last.Select + last.President + last.Smedley
    ).toBe(35)
  })

  it('never emits a negative band', () => {
    const inconsistent: GlobalClubRaceTimelinePoint[] = [
      {
        date: '2026-07-26',
        Distinguished: 1,
        Select: 3, // impossible, but must not invert the stack
        President: 0,
        Smedley: 0,
        official: 0,
      },
    ]
    const [point] = stackedRaceTimeline(inconsistent, counts)
    // The single point is also the last, so it takes the anchor.
    expect(point).toEqual({ date: '2026-07-26', ...counts })

    const [first] = stackedRaceTimeline([...inconsistent, timeline[2]], counts)
    expect(first.Distinguished).toBe(0)
    expect(first.Select).toBe(3)
  })

  it('returns an empty series for an empty timeline', () => {
    expect(stackedRaceTimeline([], counts)).toEqual([])
  })
})
