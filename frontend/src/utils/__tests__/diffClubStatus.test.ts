import { describe, it, expect } from 'vitest'
import { diffClubStatus } from '../diffClubStatus'
import type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
} from '@toastmasters/shared-contracts'

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
