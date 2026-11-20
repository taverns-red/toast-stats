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
 *   takes them from the newest such list, as at its suspension (#3097);
 *   any other closed club leaves them out.
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
 *   before that. They only date closures: a March 31 suspension closes on
 *   October 1 and stays inside the four-period window until September 30
 *   two years later, when its suspend date is three June 30 lists back
 *   (#3064 review F2).
 * - When `previousSuspended` is unknown, from July 1 to September 30 the
 *   list is unknown and the builder returns null: the clubs that list would
 *   add are missing, so an empty district would read as a measured zero
 *   (#1757, #3064 review N2).
 *
 * Rows are public club-level facts only, as in `suspended-clubs.json`.
 *
 * @module ReinstatableClubsBuilder
 */

import { classifyReinstatement } from '@taverns-red/analytics-core'
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
  /** The date's roster: club number → its district and club status. */
  roster?: ReadonlyMap<string, RosterEntry> | null
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
    oldestPeriod: result.oldestPeriod,
    addsToBase: result.addsToBase,
    reason: result.reason,
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
  // June 30 rows, from the newest list that has the club: its suspend date
  // dates the closure, and its division and area place a closed club
  // (#3097), as at its suspension.
  const juneRows = new Map<string, SuspendedClub>()
  for (const list of [
    ...[...(input.olderSuspended ?? [])].reverse(),
    input.previousSuspended,
  ]) {
    for (const club of indexSuspended(list).values()) {
      juneRows.set(club.clubNumber, club)
    }
  }
  const roster = input.roster ?? null
  const current = indexSuspended(suspended)

  const districtIds = Object.keys(suspended.districts).filter(
    id => !isUndistricted(id)
  )
  const known = new Set(districtIds)

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
    if (districtId === undefined || !known.has(districtId)) continue
    const list = carried.get(districtId) ?? []
    list.push(row)
    carried.set(districtId, list)
  }
  const carriedNumbers = new Set(
    [...carried.values()].flat().map(row => row.clubNumber)
  )

  const closedByDistrict = new Map<string, ReinstatableClub[]>()
  for (const row of closedByNumber.values()) {
    if (!known.has(row.districtId)) continue
    if (current.has(row.clubNumber) || carriedNumbers.has(row.clubNumber)) {
      continue
    }
    // On the date's roster: not closed, whatever a later index says.
    if (roster?.has(row.clubNumber)) continue
    const june = juneRows.get(row.clubNumber)
    const suspendDate = june?.suspendDate
    const result = classifyReinstatement(
      {
        status: 'closed',
        lastSeen: row.lastSeen,
        ...(suspendDate !== undefined && { suspendDate }),
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
      oldestPeriod: result.oldestPeriod,
      addsToBase: result.addsToBase,
      reason: result.reason,
    })
    closedByDistrict.set(row.districtId, list)
  }

  const districts: Record<string, ReinstatableClub[]> = {}
  for (const districtId of districtIds) {
    const rows = suspended.districts[districtId]!.map(club =>
      suspendedRow(club, snapshotDate)
    )
    // Newest closure first; club number breaks ties so the file is stable.
    const fromClosed = (closedByDistrict.get(districtId) ?? []).sort(
      (a, b) =>
        (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') ||
        a.clubNumber.localeCompare(b.clubNumber)
    )
    districts[districtId] = [
      ...rows,
      ...(carried.get(districtId) ?? []),
      ...fromClosed,
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
