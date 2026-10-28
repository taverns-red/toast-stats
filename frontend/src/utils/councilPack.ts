/**
 * Council print packs (#2299) — pure data for the one-page Area pack and the
 * two-page Division pack (summary, then the full club roster).
 *
 * Reuse only (R7): no analytics rule lives here.
 *   - Recognition, visits and Club Success Plans come from the
 *     `DivisionPerformance` / `AreaPerformance` rows `extractDivisionPerformance`
 *     already derives for the Area and Division pages (same snapshot, same
 *     pinned date), so the pack prints exactly what those pages show.
 *   - Close-to-Distinguished is `buildActionList(...).closeToDistinguished`
 *     for the same scope, the Action List's list.
 *   - Labels reuse `renderRecognitionBadge` (area), `divisionChip` (division)
 *     and `getClubHealthStatusShortLabel` (club health).
 *
 * The page owns the program year and the pinned snapshot date and passes them
 * in (R3). Long lists are capped with an explicit "+K more" count rather than
 * clipped, so a printed list never silently drops clubs.
 */

import { normalizeClubId } from '@taverns-red/shared-contracts'
import { buildActionList, compareId } from './actionListData'
import type { CloseToDistinguishedItem } from './actionListData'
import { getAreaVisitDeadlines } from './areaRecognitionState'
import { renderRecognitionBadge } from './areaRecognitionBadge'
import { calculateAreaGapAnalysis } from './areaGapAnalysis'
import { calculateDivisionGapAnalysis } from './divisionGapAnalysis'
import { divisionChip } from '../components/DivisionRecognitionChip'
import { getClubHealthStatusShortLabel } from './clubHealthStatus'
import type {
  AreaPerformance,
  DivisionPerformance,
  MissingCspClub,
  MissingVisitClub,
  VisitStatus,
} from './divisionStatus'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

/** Most rows any one pack list prints before "+K more" (fits the A4∩Letter box). */
export const COUNCIL_PACK_LIST_CAP = 8

export interface CouncilPackScope {
  /** Division id from the route (matched case-insensitively). */
  division: string
  /** Area id from the route; absent for a Division pack. */
  area?: string | undefined
}

export interface CouncilPackInput {
  /** `extractDivisionPerformance(snapshot, snapshotDate)` for the district. */
  divisions: DivisionPerformance[]
  /** The district's analytics club rows (`allClubs`). */
  clubs: ClubTrend[]
  /** The pinned snapshot date (`YYYY-MM-DD`) the page queried under (R3). */
  snapshotDate: string
  /** The page's program year (`YYYY-YYYY`) (R3). */
  programYear: string
}

export interface CappedList<T> {
  shown: T[]
  total: number
  /** `total - shown.length`: printed as "+K more", never dropped silently. */
  more: number
}

/** One gap cell, formatted as the Area and Division tables format it. */
export type GapCell = string

export interface PackRecognition {
  label: string
  paidClubs: number
  clubBase: number
  distinguishedClubs: number
  requiredDistinguishedClubs: number
  /** "+N" distinguished clubs to the tier, "-" achieved, "N/A" net loss. */
  gapToDistinguished: GapCell
  gapToSelect: GapCell
  gapToPresidents: GapCell
}

export interface PackAreaRow {
  areaId: string
  recognition: string
  paidClubs: number
  clubBase: number
  distinguishedClubs: number
  requiredDistinguishedClubs: number
  /** The current round's visit status (round 1 Jul–Nov, round 2 Dec–Jun). */
  visits: VisitStatus
  /** Active clubs missing the current round's visit. */
  missingVisit: MissingVisitClub[]
  cspTracked: boolean
  cspSubmitted: number
  /** Clubs held to the plan: submitted + active missing (the narratives' total). */
  cspHeld: number
}

export interface PackCspClub extends MissingCspClub {
  areaId: string
}

export interface PackCsp {
  tracked: boolean
  submitted: number
  held: number
  missing: CappedList<PackCspClub>
}

export type PackVisitMark = 'done' | 'missing' | 'not-held'
export type PackCspMark = 'submitted' | 'missing' | 'not-held'

export interface PackClubRow {
  clubId: string
  clubName: string
  areaId: string
  health: string
  members: number | null
  goals: number | null
  /** Distinguished tier, or '—'. */
  distinguished: string
  /** Current-round visit, from the area's missing lists; null if not in the snapshot. */
  visit: PackVisitMark | null
  /** Club Success Plan, from the area's lists; null when not tracked. */
  csp: PackCspMark | null
}

export interface CouncilPack {
  divisionId: string
  areaId: string | null
  recognition: PackRecognition
  areas: PackAreaRow[]
  visitRound: 1 | 2
  /** ISO deadline of the current visit round (`getAreaVisitDeadlines`). */
  visitDeadline: string
  closeToDistinguished: CappedList<CloseToDistinguishedItem>
  csp: PackCsp
  roster: PackClubRow[]
}

const TIER_LABEL: Record<ClubTrend['distinguishedLevel'], string> = {
  NotDistinguished: '—',
  Distinguished: 'Distinguished',
  Select: 'Select',
  President: "President's",
  Smedley: 'Smedley',
}

/** Same rendering as AreaPerformanceRow's gap cells. */
function gap(level: {
  achieved: boolean
  achievable: boolean
  distinguishedClubsNeeded: number
}): GapCell {
  if (level.achieved) return '-'
  if (!level.achievable) return 'N/A'
  return `+${level.distinguishedClubsNeeded}`
}

function cap<T>(items: T[], limit = COUNCIL_PACK_LIST_CAP): CappedList<T> {
  const shown = items.slice(0, limit)
  return { shown, total: items.length, more: items.length - shown.length }
}

function currentVisits(area: AreaPerformance): VisitStatus {
  return area.currentRound === 1
    ? area.firstRoundVisits
    : area.secondRoundVisits
}

function areaRow(area: AreaPerformance): PackAreaRow {
  return {
    areaId: area.areaId,
    recognition: renderRecognitionBadge(area.recognitionState).label,
    paidClubs: area.paidClubs,
    clubBase: area.clubBase,
    distinguishedClubs: area.distinguishedClubs,
    requiredDistinguishedClubs: area.requiredDistinguishedClubs,
    visits: currentVisits(area),
    missingVisit: area.clubsMissingCurrentRoundVisit,
    cspTracked: area.cspTracked,
    cspSubmitted: area.cspSubmittedCount,
    cspHeld: area.cspSubmittedCount + area.clubsMissingCsp.length,
  }
}

function areaRecognition(area: AreaPerformance): PackRecognition {
  const g = calculateAreaGapAnalysis({
    clubBase: area.clubBase,
    paidClubs: area.paidClubs,
    distinguishedClubs: area.distinguishedClubs,
  })
  return {
    label: renderRecognitionBadge(area.recognitionState).label,
    paidClubs: area.paidClubs,
    clubBase: area.clubBase,
    distinguishedClubs: area.distinguishedClubs,
    requiredDistinguishedClubs: area.requiredDistinguishedClubs,
    gapToDistinguished: gap(g.distinguishedGap),
    gapToSelect: gap(g.selectGap),
    gapToPresidents: gap(g.presidentsGap),
  }
}

function divisionRecognition(division: DivisionPerformance): PackRecognition {
  const g = calculateDivisionGapAnalysis({
    clubBase: division.clubBase,
    paidClubs: division.paidClubs,
    distinguishedClubs: division.distinguishedClubs,
  })
  return {
    label: divisionChip(division).label,
    paidClubs: division.paidClubs,
    clubBase: division.clubBase,
    distinguishedClubs: division.distinguishedClubs,
    requiredDistinguishedClubs: division.requiredDistinguishedClubs,
    gapToDistinguished: gap(g.distinguishedGap),
    gapToSelect: gap(g.selectGap),
    gapToPresidents: gap(g.presidentsGap),
  }
}

function lastOf<T>(items: T[] | undefined): T | undefined {
  return items && items.length > 0 ? items[items.length - 1] : undefined
}

export function buildCouncilPack(
  input: CouncilPackInput,
  scope: CouncilPackScope
): CouncilPack | null {
  const wantDivision = scope.division.toUpperCase()
  const division = input.divisions.find(
    d => d.divisionId.toUpperCase() === wantDivision
  )
  if (!division) return null
  const wantArea = scope.area?.toUpperCase()
  const area = wantArea
    ? division.areas.find(a => a.areaId.toUpperCase() === wantArea)
    : undefined
  if (wantArea && !area) return null

  const areas = area ? [area] : division.areas
  const divisionId = division.divisionId
  const areaId = area?.areaId ?? null
  // The extracted ids, not the route params, so the scopes agree exactly.
  const actionScope = { division: divisionId, area: areaId ?? undefined }

  const close = buildActionList(
    {
      clubs: input.clubs,
      interventionClubs: [],
      divisions: input.divisions,
      snapshotDate: input.snapshotDate,
      programYear: input.programYear,
    },
    actionScope
  ).closeToDistinguished.sort(
    (a, b) =>
      compareId(a.areaId, b.areaId) || a.clubName.localeCompare(b.clubName)
  )

  const cspSource = area ?? division
  const cspTracked = cspSource.cspTracked
  const cspMissing: PackCspClub[] = cspTracked
    ? areas.flatMap(a =>
        a.clubsMissingCsp.map(c => ({ ...c, areaId: a.areaId }))
      )
    : []

  // Per-club marks, read from the same area lists the sections print. The
  // snapshot pads club numbers to eight digits; analytics ids are bare, so
  // both sides go through the shared normalizeClubId.
  const visitMark = new Map<string, PackVisitMark>()
  const cspMark = new Map<string, PackCspMark>()
  for (const a of areas) {
    for (const c of a.clubsMissingCurrentRoundVisit)
      visitMark.set(normalizeClubId(c.clubNumber), 'missing')
    for (const c of a.clubsMissingCurrentRoundVisitIneligible)
      visitMark.set(normalizeClubId(c.clubNumber), 'not-held')
    for (const c of a.clubsMissingCsp)
      cspMark.set(normalizeClubId(c.clubNumber), 'missing')
    for (const c of a.clubsMissingCspIneligible)
      cspMark.set(normalizeClubId(c.clubNumber), 'not-held')
  }
  const inSnapshotArea = new Set(areas.map(a => a.areaId.toUpperCase()))

  const roster: PackClubRow[] = input.clubs
    .filter(
      c =>
        c.divisionId.toUpperCase() === divisionId.toUpperCase() &&
        (!areaId || c.areaId.toUpperCase() === areaId.toUpperCase())
    )
    .sort(
      (a, b) =>
        compareId(a.areaId, b.areaId) || a.clubName.localeCompare(b.clubName)
    )
    .map(c => {
      const known = inSnapshotArea.has(c.areaId.toUpperCase())
      return {
        clubId: c.clubId,
        clubName: c.clubName,
        areaId: c.areaId,
        // The one-word label (#1833) so the club name gets the width on paper.
        health: getClubHealthStatusShortLabel(c.currentStatus),
        members: lastOf(c.membershipTrend)?.count ?? null,
        goals: lastOf(c.dcpGoalsTrend)?.goalsAchieved ?? null,
        distinguished: TIER_LABEL[c.distinguishedLevel] ?? '—',
        visit: known
          ? (visitMark.get(normalizeClubId(c.clubId)) ?? 'done')
          : null,
        csp: cspTracked
          ? known
            ? (cspMark.get(normalizeClubId(c.clubId)) ?? 'submitted')
            : null
          : null,
      }
    })

  const round = areas[0]?.currentRound ?? 1
  const { r1, r2 } = getAreaVisitDeadlines(input.snapshotDate)

  return {
    divisionId,
    areaId,
    recognition: area ? areaRecognition(area) : divisionRecognition(division),
    areas: areas.map(areaRow),
    visitRound: round,
    visitDeadline: round === 1 ? r1 : r2,
    closeToDistinguished: cap(close),
    csp: {
      tracked: cspTracked,
      submitted: cspTracked ? cspSource.cspSubmittedCount : 0,
      held: cspTracked
        ? cspSource.cspSubmittedCount + cspSource.clubsMissingCsp.length
        : 0,
      missing: cap(cspMissing),
    },
    roster,
  }
}
