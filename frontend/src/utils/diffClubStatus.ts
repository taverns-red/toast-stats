/**
 * Club operational-status diff (#1247, epic #1246 Sprint 1).
 *
 * Pure helper that derives `club-status` change events between two dated
 * district snapshots — a club's operational status (`Active` / `Low` /
 * `Suspended` / `Ineligible`) moving in EITHER direction. This is distinct from
 * `distinguished`, which is a recognition *tier*, not operational health.
 *
 * Computed in the frontend, mirroring `diffAreaDivisionStatus` (#1014): #799
 * made the frontend the source-of-truth for recognition/status diffs to avoid
 * the analytics-core engine diverging from the rendered tables (Lesson 117).
 * The `clubStatus` field is already present on both snapshots (the club
 * added/removed roster labels read it), so this needs zero new data plumbing.
 *
 * NOTE — closing-overlay behaviour (intended, not a bug): this compares the
 * BASE `clubStatus` recorded on each snapshot. The read-time club-status overlay
 * (`clubStatusOverlay.ts`, which promotes-only-to-Active during the dues-renewal
 * closing window) is NOT applied here. So a Low→Active flip that exists only in
 * the daily Dues-Renewal overlay won't surface on the Changes feed until the
 * official snapshot itself reports Active. That is deliberate: the Changes feed
 * shows *confirmed* transitions, not provisional closing-window promotions.
 *
 * Each emitted `DiffEvent` carries `clubId` + `clubName` and a `label` that
 * BEGINS with the club name, so `ChangeLabel` auto-links the leading token to
 * the club's scoped route exactly as the other club events do (#1013).
 *
 * @module diffClubStatus
 */

import type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
  DiffEvent,
} from '@taverns-red/shared-contracts'

/** Operational status, base field with the legacy `status` fallback the rest of
 *  the diff uses (`diffSnapshots` reads `clubStatus ?? status` identically). */
function statusOf(club: ClubStatisticsFile): string {
  return club.clubStatus ?? club.status ?? ''
}

/** Health rank (higher = healthier) — drives the signed `magnitude` sort key. */
function statusRank(status: string): number {
  switch (status) {
    case 'Active':
      return 3
    case 'Low':
      return 2
    case 'Suspended':
      return 1
    case 'Ineligible':
      return 0
    default:
      return 0
  }
}

/**
 * Directional label, always beginning with the club name. Improvements to
 * Active and declines from Active get bespoke prose; any other move (e.g.
 * Low→Suspended) falls back to a neutral "changed status: <from> → <to>".
 */
function statusLabel(name: string, from: string, to: string): string {
  if (to === 'Active') return `${name} became Active (was ${from})`
  if (from === 'Active') {
    if (to === 'Low') return `${name} dropped to Low (was Active)`
    if (to === 'Suspended') return `${name} was suspended (was Active)`
    if (to === 'Ineligible') return `${name} became Ineligible (was Active)`
  }
  return `${name} changed status: ${from} → ${to}`
}

/**
 * Compute club operational-status transition events between two dated snapshots.
 * Only clubs present in BOTH snapshots are diffed — a club in only one snapshot
 * is a roster add/remove, already surfaced by `club-added`/`club-removed`. A
 * transition is skipped when either side has an empty/missing status (the same
 * roster-change case). Returns events sorted by descending magnitude of swing.
 */
export function diffClubStatus(
  from: DistrictStatisticsFile,
  to: DistrictStatisticsFile
): DiffEvent[] {
  const fromClubs = new Map(from.clubs.map(c => [c.clubId, c]))
  const events: DiffEvent[] = []

  for (const toClub of to.clubs) {
    const fromClub = fromClubs.get(toClub.clubId)
    if (!fromClub) continue

    const fromStatus = statusOf(fromClub)
    const toStatus = statusOf(toClub)
    // Empty on either side → a roster add/remove, not an operational change.
    if (!fromStatus || !toStatus) continue
    if (fromStatus === toStatus) continue

    events.push({
      category: 'club-status',
      clubId: toClub.clubId,
      clubName: toClub.clubName,
      label: statusLabel(toClub.clubName, fromStatus, toStatus),
      magnitude: statusRank(toStatus) - statusRank(fromStatus),
    })
  }

  // Biggest absolute health swing first; stable tie-break by club name.
  events.sort((a, b) => {
    const byMag = Math.abs(b.magnitude) - Math.abs(a.magnitude)
    if (byMag !== 0) return byMag
    return a.clubName.localeCompare(b.clubName)
  })

  return events
}
