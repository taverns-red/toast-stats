/**
 * Builds the per-date `reinstatable-clubs.json` (#3007, phase 2): the suspended
 * and closed clubs that can still be reinstated, per district.
 *
 * The rule is `classifyReinstatement` in analytics-core. This module gathers
 * its inputs and shapes its output:
 *
 * - Suspended clubs come from the date's `suspended-clubs.json` list. Only
 *   districts in that list are written: a district whose source was not read
 *   has no key, which readers take as "unknown", never zero (#1757).
 *   District U (clubs not in a district) is never written. District F is a
 *   real district and is.
 * - Closed clubs come from the closed-club index (`config/closed-club-names.json`),
 *   grouped by the district each club was last seen in. The index has no
 *   division or area. A closed club on a June 30 suspended list (below)
 *   takes them from the newest such list, as at its suspension, when that
 *   row is in the same district (#3097); any other closed club leaves them
 *   out.
 * - A club in both lists is listed once, as suspended.
 * - Optional `previousSuspended` is the previous program year's last
 *   suspended list (its June 30 snapshot). The date's own list keeps only
 *   suspensions dated in the current program year, so from July 1 a club
 *   suspended on March 31 is no longer on it. By the FAQ that club stays
 *   suspended until October 1, and reinstating it before then adds to the
 *   club base. Before October 1 it is listed as suspended, with the
 *   previous list's division and area, when the date's roster shows it
 *   Suspended or the closed index has it (it left the roster). A club the
 *   roster shows Active or Low was reinstated and is left out; any other
 *   status (Ineligible, or none) is not taken as reinstated. From October 1
 *   it is a closed club like any other, but its closure is dated from its
 *   suspend date, not from `lastSeen`.
 * - Optional `olderSuspended` holds the June 30 lists of the program years
 *   before that, and `marchSuspended` the March 31 lists (#3103). They only
 *   give closed clubs their TI suspend date, the newest list first. A
 *   March 31 suspension leaves the roster at the July rollover, so only its
 *   own June 30 list has it; a September 30 suspension closes in April, so
 *   only a March 31 list has it. Either can stay eligible for five renewal
 *   periods, so lists up to three program years back matter.
 * - Optional `legacyDeadlines` (club number → suspension deadline, from
 *   `config/legacy-suspension-deadlines.json`) covers clubs suspended before
 *   the suspended lists began (2025-07-31). A TI date wins over it. Without
 *   either, the rule decides from `lastSeen` bounds and the row carries no
 *   `inactivePeriod` or `lastChanceBy` (#3103).
 * - When `previousSuspended` is unknown, from July 1 to September 30 the
 *   list is unknown and the builder returns null: the clubs that list would
 *   add are missing, so an empty district would read as a measured zero
 *   (#1757, #3064 review N2).
 *
 * - Optional `districtIds` is the date's district set, from its
 *   `all-districts-rankings.json` (#3101). Toastmasters retires districts
 *   at a rollover (64 on 2026-07-01, four on 2025-07-01). A closed or
 *   carried club whose district is in neither that set nor the suspended
 *   list is listed under its old number with `districtRetiredOn`, the
 *   July 1 the district was retired. A district in the set but not in the
 *   suspended list stays unknown: its list was not read. Without the set,
 *   no district is taken as retired and those clubs are left out.
 *
 * Rows are public club-level facts only, as in `suspended-clubs.json`.
 *
 * @module ReinstatableClubsBuilder
 */

import {
  canonicalDistrictId,
  classifyReinstatement,
} from '@taverns-red/analytics-core'
import {
  REINSTATABLE_CLUBS_FORMAT,
  type ClosedClubNameIndex,
  type ReinstatableClub,
  type ReinstatableClubs,
  type SuspendedClub,
  type SuspendedClubs,
} from '@taverns-red/shared-contracts'

export interface BuildReinstatableClubsInput {
  /** The snapshot (logical) date the list describes, ISO `YYYY-MM-DD`. */
  snapshotDate: string
  /** The date's suspended-clubs list. */
  suspended: SuspendedClubs
  /** The closed-club index. */
  closed: ClosedClubNameIndex
  /** The previous program year's last suspended list, when it is known. */
  previousSuspended?: SuspendedClubs | null
  /**
   * The June 30 suspended lists of the program years before the previous
   * one, newest first, when they are known. Used only to date closures.
   */
  olderSuspended?: readonly SuspendedClubs[]
  /** March 31 suspended lists, when known (#3103). */
  marchSuspended?: readonly SuspendedClubs[]
  /** Club number → suspension deadline from status history (#3103). */
  legacyDeadlines?: ReadonlyMap<string, string> | null
  /** The date's roster: club number → its district and club status. */
  roster?: ReadonlyMap<string, RosterEntry> | null
  /**
   * The date's district set, from its `all-districts-rankings.json` (#3101).
   * A district in neither it nor the suspended list was retired. Without
   * it, no district is taken as retired.
   */
  districtIds?: readonly string[] | null
}

/** One club on the date's roster (`district_{id}.json` `clubs[]`). */
export interface RosterEntry {
  districtId: string
  clubStatus?: string
}

/** District U holds clubs that are not in a district. */
const isUndistricted = (districtId: string): boolean =>
  districtId.toUpperCase() === 'U'

function suspendedRow(
  club: SuspendedClub,
  snapshotDate: string
): ReinstatableClub {
  const result = classifyReinstatement(
    { status: 'suspended', suspendDate: club.suspendDate },
    snapshotDate
  )
  return {
    clubNumber: club.clubNumber,
    clubName: club.clubName,
    ...(club.division ? { division: club.division } : {}),
    ...(club.area ? { area: club.area } : {}),
    status: 'suspended',
    suspendDate: club.suspendDate,
    ...ruleFields(result),
  }
}

/** The rule's output as row fields; the period only when it is known. */
function ruleFields(
  result: ReturnType<typeof classifyReinstatement>
): Pick<
  ReinstatableClub,
  'oldestPeriod' | 'addsToBase' | 'reason' | 'inactivePeriod' | 'lastChanceBy'
> {
  return {
    oldestPeriod: result.oldestPeriod,
    addsToBase: result.addsToBase,
    reason: result.reason,
    ...(result.inactivePeriod !== undefined && {
      inactivePeriod: result.inactivePeriod,
    }),
    ...(result.lastChanceBy !== undefined && {
      lastChanceBy: result.lastChanceBy,
    }),
  }
}

/** Every club of a suspended list, by club number. */
function indexSuspended(
  list: SuspendedClubs | null | undefined
): Map<string, SuspendedClub> {
  const byNumber = new Map<string, SuspendedClub>()
  for (const clubs of Object.values(list?.districts ?? {})) {
    for (const club of clubs) byNumber.set(club.clubNumber, club)
  }
  return byNumber
}

interface ClosedRow {
  clubNumber: string
  clubName: string
  lastSeen: string
  districtId: string
}

/** Roster statuses of a club in good standing: it was reinstated. */
const REINSTATED_STATUSES = new Set(['active', 'low'])

/** The start year of the program year a date falls in. */
function programYearStart(date: string): number {
  const year = Number(date.slice(0, 4))
  return date.slice(5, 7) >= '07' ? year : year - 1
}

/**
 * The districts of the closed index that Toastmasters retired (#3101), by
 * canonical id → the July 1 it retired them, ISO. A district is retired
 * when the date's district set lacks it. It was retired at the start of
 * the first program year after the newest one with a sign of it: a closure
 * in the closed index, or a row in an earlier suspended list. A June 30
 * list carries a district through its program year even when none of its
 * clubs closed then. The date's own program year lacks it, so that year is
 * the latest it can be.
 */
function findRetiredDistricts(
  districtIds: readonly string[] | null | undefined,
  suspended: SuspendedClubs,
  closed: ClosedClubNameIndex,
  earlierLists: readonly SuspendedClubs[],
  snapshotDate: string
): Map<string, string> {
  const retired = new Map<string, string>()
  if (!districtIds) return retired
  const onDate = new Set(
    [...districtIds, ...Object.keys(suspended.districts)].map(
      canonicalDistrictId
    )
  )
  // Newest program year (start year) each absent district is seen in.
  const newest = new Map<string, number>()
  const seen = (districtId: string, start: number, addNew: boolean) => {
    if (isUndistricted(districtId)) return
    const id = canonicalDistrictId(districtId)
    if (onDate.has(id)) return
    const prior = newest.get(id)
    if (prior === undefined && !addNew) return
    newest.set(id, Math.max(prior ?? start, start))
  }
  for (const [programYear, districts] of Object.entries(closed.programYears)) {
    for (const districtId of Object.keys(districts)) {
      seen(districtId, Number(programYear.slice(0, 4)), true)
    }
  }
  for (const list of earlierLists) {
    for (const districtId of Object.keys(list.districts)) {
      seen(districtId, programYearStart(list.snapshotDate), false)
    }
  }
  const currentStart = programYearStart(snapshotDate)
  for (const [id, start] of newest) {
    retired.set(id, `${Math.min(start + 1, currentStart)}-07-01`)
  }
  return retired
}

/** Newest closure first; club number breaks ties so the file is stable. */
const byNewestClosure = (a: ReinstatableClub, b: ReinstatableClub): number =>
  (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') ||
  a.clubNumber.localeCompare(b.clubNumber)

/** July 1 - September 30: the previous list is needed to place clubs. */
function needsPreviousList(snapshotDate: string): boolean {
  const month = snapshotDate.slice(5, 7)
  return month >= '07' && month <= '09'
}

export function buildReinstatableClubs(
  input: BuildReinstatableClubsInput
): ReinstatableClubs | null {
  const { snapshotDate, suspended, closed } = input
  if (input.previousSuspended == null && needsPreviousList(snapshotDate)) {
    return null
  }
  const previous = indexSuspended(input.previousSuspended)
  // Rows of the earlier lists (June 30 and March 31), from the newest list
  // that has the club: its suspend date places the suspension (#3103), and
  // its division and area place a closed club (#3097), as at its
  // suspension, when it is in the same district. A list dated after the
  // snapshot is never read: a rebuild must not see the future.
  const earlierLists = [
    ...(input.olderSuspended ?? []),
    ...(input.marchSuspended ?? []),
    ...(input.previousSuspended ? [input.previousSuspended] : []),
  ]
    .filter(list => list.snapshotDate <= snapshotDate)
    .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
  const juneRows = new Map<
    string,
    { club: SuspendedClub; districtId: string }
  >()
  for (const list of earlierLists) {
    for (const [districtId, clubs] of Object.entries(list.districts)) {
      for (const club of clubs) {
        juneRows.set(club.clubNumber, { club, districtId })
      }
    }
  }
  const roster = input.roster ?? null
  const current = indexSuspended(suspended)

  const districtIds = Object.keys(suspended.districts).filter(
    id => !isUndistricted(id)
  )
  const known = new Set(districtIds)
  // A district Toastmasters retired keeps its rows under the old number,
  // with the date it was retired (#3101).
  const retired = findRetiredDistricts(
    input.districtIds,
    suspended,
    closed,
    earlierLists,
    snapshotDate
  )
  const retiredOn = (districtId: string): string | undefined =>
    known.has(districtId)
      ? undefined
      : retired.get(canonicalDistrictId(districtId))

  // Closed index rows, by club number.
  const closedByNumber = new Map<string, ClosedRow>()
  for (const districts of Object.values(closed.programYears)) {
    for (const [districtId, rows] of Object.entries(districts)) {
      for (const [clubNumber, clubName, lastSeen] of rows) {
        closedByNumber.set(clubNumber, {
          clubNumber,
          clubName,
          lastSeen,
          districtId,
        })
      }
    }
  }

  // Previous-year suspensions still suspended on the date, by district.
  const carried = new Map<string, ReinstatableClub[]>()
  for (const club of previous.values()) {
    if (current.has(club.clubNumber)) continue
    const row = suspendedRow(club, snapshotDate)
    if (row.reason !== 'suspended_mar31_before_oct1') continue
    const onRoster = roster?.get(club.clubNumber)
    let districtId: string | undefined
    if (onRoster) {
      // The roster is the date's truth: Active or Low means the club was
      // reinstated. Suspended, Ineligible or no status does not (#3064 N3).
      const status = onRoster.clubStatus?.trim().toLowerCase() ?? ''
      if (REINSTATED_STATUSES.has(status)) continue
      districtId = onRoster.districtId
    } else {
      districtId = closedByNumber.get(club.clubNumber)?.districtId
    }
    if (districtId === undefined) continue
    const districtRetiredOn = retiredOn(districtId)
    if (!known.has(districtId) && districtRetiredOn === undefined) continue
    const list = carried.get(districtId) ?? []
    list.push(
      districtRetiredOn === undefined ? row : { ...row, districtRetiredOn }
    )
    carried.set(districtId, list)
  }
  const carriedNumbers = new Set(
    [...carried.values()].flat().map(row => row.clubNumber)
  )

  const closedByDistrict = new Map<string, ReinstatableClub[]>()
  for (const row of closedByNumber.values()) {
    const districtRetiredOn = retiredOn(row.districtId)
    if (!known.has(row.districtId) && districtRetiredOn === undefined) continue
    if (current.has(row.clubNumber) || carriedNumbers.has(row.clubNumber)) {
      continue
    }
    // On the date's roster: not closed, whatever a later index says.
    if (roster?.has(row.clubNumber)) continue
    const juneRow = juneRows.get(row.clubNumber)
    const suspendDate = juneRow?.club.suspendDate
    // A club realigned since its suspension: the old division is wrong.
    const june =
      juneRow?.districtId === row.districtId ? juneRow.club : undefined
    const suspensionDeadline = input.legacyDeadlines?.get(row.clubNumber)
    const result = classifyReinstatement(
      {
        status: 'closed',
        lastSeen: row.lastSeen,
        ...(suspendDate !== undefined && { suspendDate }),
        ...(suspensionDeadline !== undefined && { suspensionDeadline }),
      },
      snapshotDate
    )
    if (!result.eligible) continue
    const list = closedByDistrict.get(row.districtId) ?? []
    list.push({
      clubNumber: row.clubNumber,
      clubName: row.clubName,
      ...(june?.division ? { division: june.division } : {}),
      ...(june?.area ? { area: june.area } : {}),
      status: 'closed',
      lastSeen: row.lastSeen,
      ...ruleFields(result),
      ...(districtRetiredOn !== undefined && { districtRetiredOn }),
    })
    closedByDistrict.set(row.districtId, list)
  }

  const districts: Record<string, ReinstatableClub[]> = {}
  for (const districtId of districtIds) {
    const rows = suspended.districts[districtId]!.map(club =>
      suspendedRow(club, snapshotDate)
    )
    districts[districtId] = [
      ...rows,
      ...(carried.get(districtId) ?? []),
      ...(closedByDistrict.get(districtId) ?? []).sort(byNewestClosure),
    ]
  }
  // Retired districts, after the date's own: no suspended list of their
  // own, so carried suspensions first, then closures.
  const retiredIds = [
    ...new Set([...carried.keys(), ...closedByDistrict.keys()]),
  ]
    .filter(id => !known.has(id))
    .sort()
  for (const districtId of retiredIds) {
    districts[districtId] = [
      ...(carried.get(districtId) ?? []),
      ...(closedByDistrict.get(districtId) ?? []).sort(byNewestClosure),
    ]
  }

  return {
    _format: REINSTATABLE_CLUBS_FORMAT,
    snapshotDate,
    baseProgramYear: classifyReinstatement(
      { status: 'closed', lastSeen: snapshotDate },
      snapshotDate
    ).baseProgramYear,
    districts,
  }
}
