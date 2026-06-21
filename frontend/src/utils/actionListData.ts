/**
 * Area Director Action List — pure data derivation (epic #1228, Sprint 3 / #1231).
 *
 * Reuse-only: every section is computed from EXISTING predicates and the
 * already-derived division/area performance. No new analytics rule lives here.
 *
 *   1. Close-to-Distinguished — `isCloseToDistinguished` over
 *      `calculateClubProjection`; the gap is read straight off the projection,
 *      never re-derived (R3 / Lesson 052).
 *   2. Visit gaps — areas with active clubs missing the CURRENT round's
 *      qualifying visit, reusing `AreaPerformance.clubsMissingCurrentRoundVisit`
 *      + `currentRound` (the deadline-aware logic the divisions page already
 *      uses, #973/#832) and `getAreaVisitDeadlines` for the round deadline.
 *   3. Intervention-required — clubs whose health classification
 *      (`currentStatus`) is `'intervention-required'`.
 *
 * Scope (`division`/`area`) is owned by the page and passed in as an argument
 * (R3 / Lesson 124); an out-of-range scope simply yields empty sections rather
 * than throwing, so a hand-edited/shared URL is always safe (Lesson 144).
 */

import { calculateClubProjection } from './dcpProjections'
import { isCloseToDistinguished } from './closeToDistinguished'
import { getAreaVisitDeadlines } from './areaRecognitionState'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import type { DivisionPerformance, MissingVisitClub } from './divisionStatus'

export interface ActionListScope {
  /** Restrict to a single division id (e.g. `'A'`). Absent = all divisions. */
  division?: string | undefined
  /** Restrict to a single area id (e.g. `'A1'`). Absent = all areas. */
  area?: string | undefined
}

export interface CloseToDistinguishedItem {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  /** Members still needed for Distinguished (from `gapToDistinguished`). */
  membersNeeded: number
  /** DCP goals still needed for Distinguished (from `gapToDistinguished`). */
  goalsNeeded: number
}

export interface VisitGapArea {
  divisionId: string
  areaId: string
  currentRound: 1 | 2
  /** ISO `YYYY-MM-DD` deadline for the current round (Nov 30 / May 31). */
  deadline: string
  /** Active clubs in the area missing the current round's visit. */
  missingClubs: MissingVisitClub[]
}

export interface InterventionItem {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
}

export interface ActionListSections {
  closeToDistinguished: CloseToDistinguishedItem[]
  visitGaps: VisitGapArea[]
  interventionRequired: InterventionItem[]
}

export interface ActionListInput {
  /** All clubs in the district (source for the Close-to-Distinguished scan). */
  clubs: ClubTrend[]
  /** Clubs already classified intervention-required by the analytics hook. */
  interventionClubs: ClubTrend[]
  /** Per-division performance, already carrying deadline-aware area state. */
  divisions: DivisionPerformance[]
  /** Snapshot/as-of date (`YYYY-MM-DD`) for the visit-round deadline. */
  snapshotDate: string
}

function inScope(
  divisionId: string,
  areaId: string,
  scope: ActionListScope
): boolean {
  if (scope.division && divisionId !== scope.division) return false
  if (scope.area && areaId !== scope.area) return false
  return true
}

export function buildActionList(
  input: ActionListInput,
  scope: ActionListScope = {}
): ActionListSections {
  const { clubs, interventionClubs, divisions, snapshotDate } = input

  const closeToDistinguished: CloseToDistinguishedItem[] = clubs
    .filter(club => inScope(club.divisionId, club.areaId, scope))
    // Project once per club, then filter+map off that single projection — the
    // projection is the most expensive call in this file (four gap passes).
    .map(club => ({ club, projection: calculateClubProjection(club) }))
    .filter(({ club, projection }) =>
      isCloseToDistinguished({ projection, cspSubmitted: club.cspSubmitted })
    )
    .map(({ club, projection }) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      divisionId: club.divisionId,
      areaId: club.areaId,
      membersNeeded: projection.gapToDistinguished.members,
      goalsNeeded: projection.gapToDistinguished.goals,
    }))

  const { r1, r2 } = getAreaVisitDeadlines(snapshotDate)
  const visitGaps: VisitGapArea[] = divisions.flatMap(division =>
    division.areas
      .filter(area => inScope(division.divisionId, area.areaId, scope))
      .filter(area => area.clubsMissingCurrentRoundVisit.length > 0)
      .map(area => ({
        divisionId: division.divisionId,
        areaId: area.areaId,
        currentRound: area.currentRound,
        deadline: area.currentRound === 1 ? r1 : r2,
        missingClubs: area.clubsMissingCurrentRoundVisit,
      }))
  )

  const interventionRequired: InterventionItem[] = interventionClubs
    .filter(club => club.currentStatus === 'intervention-required')
    .filter(club => inScope(club.divisionId, club.areaId, scope))
    .map(club => ({
      clubId: club.clubId,
      clubName: club.clubName,
      divisionId: club.divisionId,
      areaId: club.areaId,
    }))

  return { closeToDistinguished, visitGaps, interventionRequired }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** "needs 2 members + 1 DCP goal" — shared by the list row and the CSV export
 *  so the pluralization rule lives in one place. */
export function formatCloseGap(item: CloseToDistinguishedItem): string {
  return `needs ${plural(item.membersNeeded, 'member')} + ${plural(
    item.goalsNeeded,
    'DCP goal'
  )}`
}

/** "1 club unvisited · Round 1, due 2025-11-30" — shared by the list row and
 *  the CSV export. */
export function formatVisitGap(gap: VisitGapArea): string {
  return `${plural(gap.missingClubs.length, 'club')} unvisited · Round ${
    gap.currentRound
  }, due ${gap.deadline}`
}
