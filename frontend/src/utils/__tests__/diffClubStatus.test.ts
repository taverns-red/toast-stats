import { describe, it, expect } from 'vitest'
import { diffClubStatus, countClubStatusTotals } from '../diffClubStatus'
import type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
} from '@taverns-red/shared-contracts'

/* Pure diff helper for club OPERATIONAL-status transitions (#1247). It compares
   the `clubStatus` (Active/Low/Suspended/Ineligible) already present on both
   dated snapshots and emits a `club-status` DiffEvent for every club whose
   status changed, in either direction. Computed in the frontend, mirroring
   `diffAreaDivisionStatus` (#1014, Lesson 117) — recognition/status diffs are
   frontend source-of-truth. No page mount (R22). */

/** Minimal club row carrying just the fields the status diff reads. */
function club(o: {
  clubId: string
  clubName: string
  clubStatus?: string
  status?: string
}): ClubStatisticsFile {
  return {
    clubId: o.clubId,
    clubName: o.clubName,
    clubStatus: o.clubStatus,
    status: o.status ?? '',
  } as unknown as ClubStatisticsFile
}

function snapshot(
  snapshotDate: string,
  clubs: ClubStatisticsFile[]
): DistrictStatisticsFile {
  return {
    districtId: '61',
    snapshotDate,
    clubs,
  } as unknown as DistrictStatisticsFile
}

const HEALTH = {
  clubId: '00001234',
  clubName: 'Health Canada Club',
}

/** Build a from→to pair where the single shared club flips status. */
function pair(fromStatus: string, toStatus: string) {
  return {
    from: snapshot('2026-06-20', [club({ ...HEALTH, clubStatus: fromStatus })]),
    to: snapshot('2026-06-27', [club({ ...HEALTH, clubStatus: toStatus })]),
  }
}

describe('diffClubStatus (#1247)', () => {
  it('emits a directional improvement label for Low → Active', () => {
    const { from, to } = pair('Low', 'Active')
    const events = diffClubStatus(from, to)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      category: 'club-status',
      clubId: HEALTH.clubId,
      clubName: HEALTH.clubName,
      label: 'Health Canada Club became Active (was Low)',
    })
    // label begins with the club name so ChangeLabel auto-links it (#1013).
    expect(events[0].label.startsWith(HEALTH.clubName)).toBe(true)
    // improvement → positive magnitude.
    expect(events[0].magnitude).toBeGreaterThan(0)
  })

  it('emits "became Active (was Suspended)" for Suspended → Active', () => {
    const { from, to } = pair('Suspended', 'Active')
    const events = diffClubStatus(from, to)
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe(
      'Health Canada Club became Active (was Suspended)'
    )
  })

  it('emits a decline label for Active → Low', () => {
    const { from, to } = pair('Active', 'Low')
    const events = diffClubStatus(from, to)
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe(
      'Health Canada Club dropped to Low (was Active)'
    )
    expect(events[0].magnitude).toBeLessThan(0)
  })

  it('emits a suspension label for Active → Suspended', () => {
    const { from, to } = pair('Active', 'Suspended')
    const events = diffClubStatus(from, to)
    expect(events[0].label).toBe(
      'Health Canada Club was suspended (was Active)'
    )
  })

  it('emits an ineligible label for Active → Ineligible', () => {
    const { from, to } = pair('Active', 'Ineligible')
    const events = diffClubStatus(from, to)
    expect(events[0].label).toBe(
      'Health Canada Club became Ineligible (was Active)'
    )
  })

  it('emits a generic label for a move not involving Active', () => {
    const { from, to } = pair('Low', 'Suspended')
    const events = diffClubStatus(from, to)
    expect(events[0].label).toBe(
      'Health Canada Club changed status: Low → Suspended'
    )
  })

  it('emits nothing when the status is unchanged', () => {
    const { from, to } = pair('Active', 'Active')
    expect(diffClubStatus(from, to)).toEqual([])
  })

  it('falls back to the legacy `status` field when `clubStatus` is absent', () => {
    const from = snapshot('2026-06-20', [club({ ...HEALTH, status: 'Low' })])
    const to = snapshot('2026-06-27', [club({ ...HEALTH, status: 'Active' })])
    const events = diffClubStatus(from, to)
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe('Health Canada Club became Active (was Low)')
  })

  it('emits nothing for a club present in only one snapshot (roster change, not status change)', () => {
    const from = snapshot('2026-06-20', [
      club({ clubId: 'a', clubName: 'Alpha', clubStatus: 'Active' }),
    ])
    const to = snapshot('2026-06-27', [
      club({ clubId: 'a', clubName: 'Alpha', clubStatus: 'Active' }),
      club({ clubId: 'b', clubName: 'Bravo', clubStatus: 'Active' }),
    ])
    expect(diffClubStatus(from, to)).toEqual([])
  })

  it('emits nothing when one side has an empty/missing status (covered by roster add/remove)', () => {
    const from = snapshot('2026-06-20', [club({ ...HEALTH, clubStatus: '' })])
    const to = snapshot('2026-06-27', [
      club({ ...HEALTH, clubStatus: 'Active' }),
    ])
    expect(diffClubStatus(from, to)).toEqual([])
  })

  it('sorts the biggest status swing first', () => {
    const from = snapshot('2026-06-20', [
      club({ clubId: 'a', clubName: 'Alpha', clubStatus: 'Active' }), // → Low (small decline)
      club({ clubId: 'b', clubName: 'Bravo', clubStatus: 'Ineligible' }), // → Active (big improvement)
    ])
    const to = snapshot('2026-06-27', [
      club({ clubId: 'a', clubName: 'Alpha', clubStatus: 'Low' }),
      club({ clubId: 'b', clubName: 'Bravo', clubStatus: 'Active' }),
    ])
    const events = diffClubStatus(from, to)
    expect(events).toHaveLength(2)
    expect(events[0].clubName).toBe('Bravo')
  })
})

/* #2425 — the What Changed "Active clubs" tile counts clubs per operational
   status on each snapshot from the SAME `clubStatus ?? status` field the
   club-status events read (R3). */
describe('countClubStatusTotals (#2425)', () => {
  const from = snapshot('2026-10-01', [
    club({ clubId: '1', clubName: 'A', clubStatus: 'Active' }),
    club({ clubId: '2', clubName: 'B', clubStatus: 'Active' }),
    club({ clubId: '3', clubName: 'C', clubStatus: 'Active' }),
    club({ clubId: '4', clubName: 'D', clubStatus: 'Low' }),
    club({ clubId: '5', clubName: 'E', clubStatus: 'Ineligible' }),
  ])
  // Club 2 moves Active -> Suspended, club 3 leaves, club 6 joins as Low.
  const to = snapshot('2026-10-31', [
    club({ clubId: '1', clubName: 'A', clubStatus: 'Active' }),
    club({ clubId: '2', clubName: 'B', clubStatus: 'Suspended' }),
    club({ clubId: '4', clubName: 'D', clubStatus: 'Low' }),
    club({ clubId: '5', clubName: 'E', clubStatus: 'Ineligible' }),
    club({ clubId: '6', clubName: 'F', clubStatus: 'Low' }),
  ])

  it('counts each status on both sides with signed deltas, including an Active -> Suspended move', () => {
    const t = countClubStatusTotals(from, to)
    expect(t.byStatus.Active).toEqual({ from: 3, to: 1, delta: -2 })
    expect(t.byStatus.Low).toEqual({ from: 1, to: 2, delta: 1 })
    expect(t.byStatus.Ineligible).toEqual({ from: 1, to: 1, delta: 0 })
    expect(t.byStatus.Suspended).toEqual({ from: 0, to: 1, delta: 1 })
    expect(t.all).toEqual({ from: 5, to: 5, delta: 0 })
    expect(t.statusMissingFrom).toBe(false)
    expect(t.statusMissingTo).toBe(false)
  })

  it('status counts sum to All clubs on each side', () => {
    const t = countClubStatusTotals(from, to)
    for (const side of ['from', 'to'] as const) {
      const sum =
        Object.values(t.byStatus).reduce((n, c) => n + c[side], 0) +
        t.unrecorded[side]
      expect(sum).toBe(t.all[side])
    }
  })

  it('falls back to the legacy `status` field exactly like the club-status events', () => {
    const legacy = snapshot('2026-10-01', [
      club({ clubId: '1', clubName: 'A', status: 'Low' }),
    ])
    expect(countClubStatusTotals(legacy, legacy).byStatus.Low.to).toBe(1)
  })

  it('puts clubs without a status in `unrecorded`, never in a status bucket', () => {
    const partial = snapshot('2026-10-31', [
      club({ clubId: '1', clubName: 'A', clubStatus: 'Active' }),
      club({ clubId: '2', clubName: 'B' }),
    ])
    const t = countClubStatusTotals(partial, partial)
    expect(t.byStatus.Active.to).toBe(1)
    expect(t.unrecorded.to).toBe(1)
    expect(t.all.to).toBe(2)
    expect(t.statusMissingTo).toBe(false)
  })

  it('flags a snapshot on which no club carries a status', () => {
    const bare = snapshot('2026-10-01', [
      club({ clubId: '1', clubName: 'A' }),
      club({ clubId: '2', clubName: 'B' }),
    ])
    const t = countClubStatusTotals(bare, to)
    expect(t.statusMissingFrom).toBe(true)
    expect(t.statusMissingTo).toBe(false)
    expect(t.unrecorded.from).toBe(2)
  })
})
