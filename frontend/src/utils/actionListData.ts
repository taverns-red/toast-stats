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
 *   4. Clubs without a Club Success Plan (#1555) — `summarizeCspCompletion`
 *      over the same club rows, gated on the `programYear` the page already
 *      passes (`isCspRequired`, analytics-core): a pre-2025-26 year yields
 *      `cspTracked: false` and an empty section, never "0 clubs".
 *
 * Scope (`division`/`area`) is owned by the page and passed in as an argument
 * (R3 / Lesson 124); an out-of-range scope simply yields empty sections rather
 * than throwing, so a hand-edited/shared URL is always safe (Lesson 144).
 */

import {
  cspDueDate,
  isCspOverdue,
  isCspRequired,
} from '@taverns-red/analytics-core'
import { calculateClubProjection } from './dcpProjections'
import { isCloseToDistinguished } from './closeToDistinguished'
import { getAreaVisitDeadlines } from './areaRecognitionState'
import { summarizeCspCompletion } from './cspCompletion'
import { getClubHealthStatusLabel } from './clubHealthStatus'
import { getProgramYearForDate } from './programYear'
import {
  CSP_LOST_ELIGIBILITY,
  formatCspDueDate,
  type CspDeadlineFields,
} from './cspDeadlines'
import type { ClubHealthStatus, ClubTrend } from '../hooks/useDistrictAnalytics'
import type { DivisionPerformance, MissingVisitClub } from './divisionStatus'
import type { OfficerTrainingRoundWindow } from '@taverns-red/analytics-core'
import {
  DEFAULT_TRAINING_THRESHOLD,
  shortClubs,
  trainingRoundContext,
  type ShortClub,
  type TrainingClub,
} from './officerTraining'

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

export interface CspNotSubmittedItem extends CspDeadlineFields {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  /** Health classification, so the row can say "Vulnerable" / "Intervention Required". */
  currentStatus: ClubHealthStatus
}

export interface ActionListSections {
  closeToDistinguished: CloseToDistinguishedItem[]
  visitGaps: VisitGapArea[]
  interventionRequired: InterventionItem[]
  /**
   * Whether the Club Success Plan section is meaningful for the program year
   * shown (#1555). False before 2025-26: the page renders no section and no
   * intro clause, because "0 of N" would be a lie for a year with no rule.
   */
  cspTracked: boolean
  /**
   * Whether filing a plan can still earn credit as of the pinned date (#1569).
   * Drives the seasonal section order: a to-do while true, a record of who
   * missed once false. Always false when `cspTracked` is false.
   */
  cspActionable: boolean
  /** Active clubs without a submitted CSP, sorted division → area → name. */
  cspNotSubmitted: CspNotSubmittedItem[]
  /** Suspended/ineligible clubs without a CSP in scope — footnoted, not listed. */
  cspNotSubmittedIneligibleCount: number
  /**
   * Clubs without a CSP chartered after 1 April — automatic credit (#1565):
   * footnoted, never listed, in neither count.
   */
  cspNotSubmittedAutoCreditCount: number
  /** Clubs with no CSP value on a tracked year (E2) — neither listed nor counted. */
  cspUnknownCount: number
  /**
   * The officer-training round open on the pinned date for the page's own
   * program year (#2296); null between rounds, in June (the new year's
   * Round 1 is open but the snapshot still shows the old year), or with no
   * officer-training data. The section exists only while this is set.
   */
  trainingRound: OfficerTrainingRoundWindow | null
  /** Days left in `trainingRound`, counting the pinned date. */
  trainingDaysLeft: number | null
  /** The threshold the list is built against (default 4, DCP goal 9). */
  trainingThreshold: number
  /** In-scope clubs short of the threshold in the open round. */
  trainingShort: ShortClub[]
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
  /**
   * Program year being shown ("YYYY-YYYY"), from the page that owns the
   * selection. Decides which recognition rungs existed (#1406).
   */
  programYear?: string | undefined
  /** Clubs with officers trained per round (#2296); null = not measured. */
  trainingClubs?: TrainingClub[] | null | undefined
  /** Officer-training threshold, 1–7 (default 4). */
  trainingThreshold?: number | undefined
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

/** Numeric-aware id order, so area "A2" sorts before "A10". */
export function compareId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function buildActionList(
  input: ActionListInput,
  scope: ActionListScope = {}
): ActionListSections {
  const { clubs, interventionClubs, divisions, snapshotDate, programYear } =
    input

  const closeToDistinguished: CloseToDistinguishedItem[] = clubs
    .filter(club => inScope(club.divisionId, club.areaId, scope))
    // Project once per club, then filter+map off that single projection — the
    // projection is the most expensive call in this file (four gap passes).
    .map(club => ({
      club,
      projection: calculateClubProjection(club, programYear),
    }))
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

  // #1555: the year gate is the page's `programYear` (R3), never the rows —
  // pre-2025-26 rows read as "submitted" under getCSPStatus, so an ungated
  // reduce would report an empty list as if every club had filed.
  const cspTracked = isCspRequired(programYear)
  // #1565: the per-club deadline is judged against the page's pinned date. The
  // year is the page's too; when the page did not pass one it is derived from
  // that same pinned date (as the raw path does), never from the rows or the
  // clock.
  const cspYear = programYear ?? getProgramYearForDate(snapshotDate).label
  const csp = cspTracked
    ? summarizeCspCompletion(
        clubs.filter(club => inScope(club.divisionId, club.areaId, scope)),
        { programYear: cspYear, snapshotDate }
      )
    : {
        submittedCount: 0,
        notSubmitted: [],
        notSubmittedIneligible: [],
        notSubmittedAutoCredit: [],
        unknownCount: 0,
      }
  const cspNotSubmitted: CspNotSubmittedItem[] = csp.notSubmitted
    .map(club => ({
      clubId: club.clubId,
      clubName: club.clubName,
      divisionId: club.divisionId,
      areaId: club.areaId,
      currentStatus: club.currentStatus,
      cspDueDate: club.cspDueDate,
      cspOverdue: club.cspOverdue,
    }))
    // An AD scoping to one area sees an alphabetical chase-list; a DD sees
    // areas grouped.
    .sort(
      (a, b) =>
        compareId(a.divisionId, b.divisionId) ||
        compareId(a.areaId, b.areaId) ||
        a.clubName.localeCompare(b.clubName)
    )

  // #1569: can filing still earn credit as of the pinned date? Sourced from
  // the #1567 rules rather than restating "30 September" — the standard due
  // date is `cspDueDate` for a club with no charter date, and a club chartered
  // in-year carries its own later one on the row. Actionable while EITHER is
  // still open; once neither is, the section is a record of who missed, not a
  // to-do, and drops below the sections that can still be worked.
  const standardCspDueDate = cspTracked ? cspDueDate({}, cspYear) : null
  const cspActionable =
    cspTracked &&
    ((standardCspDueDate !== null &&
      !isCspOverdue(standardCspDueDate, snapshotDate)) ||
      cspNotSubmitted.some(club => !club.cspOverdue))

  return {
    closeToDistinguished,
    visitGaps,
    interventionRequired,
    cspTracked,
    cspActionable,
    cspNotSubmitted,
    cspNotSubmittedIneligibleCount: csp.notSubmittedIneligible.length,
    cspNotSubmittedAutoCreditCount: csp.notSubmittedAutoCredit.length,
    cspUnknownCount: csp.unknownCount,
    ...trainingSection(input, scope, cspYear),
  }
}

/**
 * The officer-training section (#2296): only while a round is open on the
 * pinned date for the page's own program year. A June snapshot still holds
 * the old year's final counts while the new year's Round 1 is open, so
 * `trainingRoundContext` reports that round as pending, not open, and no
 * list is built from last year's numbers.
 */
function trainingSection(
  input: ActionListInput,
  scope: ActionListScope,
  programYear: string
): Pick<
  ActionListSections,
  'trainingRound' | 'trainingDaysLeft' | 'trainingThreshold' | 'trainingShort'
> {
  const threshold = input.trainingThreshold ?? DEFAULT_TRAINING_THRESHOLD
  const none = {
    trainingRound: null,
    trainingDaysLeft: null,
    trainingThreshold: threshold,
    trainingShort: [],
  }
  if (!input.trainingClubs || !input.snapshotDate) return none
  const context = trainingRoundContext(input.snapshotDate, programYear)
  if (!context.open) return none
  return {
    trainingRound: context.open,
    trainingDaysLeft: context.daysLeft,
    trainingThreshold: threshold,
    trainingShort: shortClubs(
      input.trainingClubs.filter(c => inScope(c.divisionId, c.areaId, scope)),
      context.open.round,
      threshold
    ),
  }
}

/**
 * The four action sections, identified by the DOM id each has always carried
 * — `#action-csp` is a published deep link from the district overview, so the
 * id is the section's identity, not an implementation detail (#1569).
 */
export type ActionSectionId =
  | 'action-close'
  | 'action-visits'
  | 'action-intervention'
  | 'action-csp'
  | 'action-training'

/** The three sections that are always present, in their standing order. */
const CORE_ACTION_SECTIONS: readonly ActionSectionId[] = [
  'action-close',
  'action-visits',
  'action-intervention',
]

/**
 * The order the sections render in (#1569) — the single source every surface
 * reads, so the rendered list, the intro copy and the CSV export cannot drift
 * apart, and a program year with no Club Success Plan requirement drops the
 * section here rather than at each call site.
 *
 * The Club Success Plan leads while `cspActionable` (a plan filed now still
 * earns credit) and trails once it has lapsed: after the deadline it is a
 * record of who missed, and should not sit above three sections a leader can
 * still act on.
 */
export function orderActionSections(
  sections: Pick<ActionListSections, 'cspTracked' | 'cspActionable'> &
    Partial<Pick<ActionListSections, 'trainingRound'>>
): ActionSectionId[] {
  // #2296: officer training is a to-do only while its round is open; it
  // leads the standing sections then (the round has a hard end date).
  const core: ActionSectionId[] = sections.trainingRound
    ? ['action-training', ...CORE_ACTION_SECTIONS]
    : [...CORE_ACTION_SECTIONS]
  if (!sections.cspTracked) return core
  return sections.cspActionable
    ? ['action-csp', ...core]
    : [...core, 'action-csp']
}

/** Each section's clause in the page's intro sentence. */
const ACTION_SECTION_CLAUSES: Record<ActionSectionId, string> = {
  'action-close': 'clubs within reach of Distinguished',
  'action-visits': 'areas with outstanding club visits',
  'action-intervention': 'clubs that need intervention',
  'action-csp': 'clubs without a Club Success Plan',
  'action-training': 'clubs short of officer training this round',
}

/**
 * The intro sentence's clause list, in render order (#1569) — so the copy
 * always names the sections in the order the reader meets them, in both
 * seasonal windows and with or without the Club Success Plan section.
 */
export function describeActionSections(
  order: readonly ActionSectionId[]
): string {
  const clauses = order.map(id => ACTION_SECTION_CLAUSES[id])
  if (clauses.length <= 1) return clauses[0] ?? ''
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** "2 members + 1 DCP goal" — the "Needs" COLUMN's value (#1577), where the
 *  header supplies the verb the sentence form spells out. A zero part is
 *  omitted (#2308): "0 members + 1 DCP goal" reads as an error when the club
 *  already meets the membership rule. A 0/0 gap is never listed — such a club
 *  is already Distinguished — so it yields '' rather than a fake requirement. */
export function formatCloseNeeds(item: CloseToDistinguishedItem): string {
  const parts: string[] = []
  if (item.membersNeeded > 0) parts.push(plural(item.membersNeeded, 'member'))
  if (item.goalsNeeded > 0) parts.push(plural(item.goalsNeeded, 'DCP goal'))
  return parts.join(' + ')
}

/** "needs 2 members + 1 DCP goal" — the SENTENCE form, still the CSV's Detail
 *  column. Derived from the column value above rather than re-stating the
 *  pluralization: a second copy of a format is a second thing to drift
 *  (lesson "a fallback alias list copied twice drifts twice"). */
export function formatCloseGap(item: CloseToDistinguishedItem): string {
  const needs = formatCloseNeeds(item)
  return needs ? `needs ${needs}` : ''
}

/** "1 club unvisited · Round 1, due 2025-11-30" — shared by the list row and
 *  the CSV export. */
export function formatVisitGap(gap: VisitGapArea): string {
  return `${plural(gap.missingClubs.length, 'club')} unvisited · Round ${
    gap.currentRound
  }, due ${gap.deadline}`
}

/** "CSP due 30 September 2026 · Vulnerable" before the club's due date;
 *  "CSP not filed by 30 September 2026 — cannot be Distinguished this program
 *  year · Vulnerable" after it (#1565). Shared by the list row and the CSV
 *  export; the health label is the same one the clubs table renders. */
export function formatCspRow(item: CspNotSubmittedItem): string {
  const date = formatCspDueDate(item.cspDueDate)
  const csp = item.cspOverdue
    ? `CSP not filed by ${date} — ${CSP_LOST_ELIGIBILITY}`
    : `CSP due ${date}`
  return `${csp} · ${getClubHealthStatusLabel(item.currentStatus)}`
}
