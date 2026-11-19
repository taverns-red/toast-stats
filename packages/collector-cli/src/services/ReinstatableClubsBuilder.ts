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
 *   division or area, so those rows leave them out.
 * - A club in both lists is listed once, as suspended.
 * - Optional `previousSuspended` is the previous program year's last
 *   suspended list (its June 30 snapshot). The date's own list keeps only
 *   suspensions dated in the current program year, so from July 1 a club
 *   suspended on March 31 is no longer on it. By the FAQ that club stays
 *   suspended until October 1, and reinstating it before then adds to the
 *   club base. Before October 1 it is listed as suspended, with the
 *   previous list's division and area, when the date's roster shows it
 *   Suspended or the closed index has it (it left the roster). A club the
 *   roster shows in any other status was reinstated and is left out. From
 *   October 1 it is a closed club like any other, but its closure is dated
 *   from its suspend date, not from `lastSeen`.
 * - When `previousSuspended` is unknown, from July 1 to September 30 closed
 *   clubs last seen from April 1 to June 30 are withheld: they may be such
 *   March 31 suspensions, and listing them as closed would say they cannot
 *   add to the base.
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

/**
 * Closed rows whose lastSeen falls Apr 1 - Jun 30 of the date's year, when
 * the date is Jul 1 - Sep 30: possibly a Mar 31 suspension still suspended.
 */
function mayBeMar31Suspension(row: ClosedRow, snapshotDate: string): boolean {
  const year = snapshotDate.slice(0, 4)
  const month = snapshotDate.slice(5, 7)
  if (month < '07' || month > '09') return false
  return row.lastSeen >= `${year}-04-01` && row.lastSeen <= `${year}-06-30`
}

export function buildReinstatableClubs(
  input: BuildReinstatableClubsInput
): ReinstatableClubs {
  const { snapshotDate, suspended, closed } = input
  const previousKnown = input.previousSuspended != null
  const previous = indexSuspended(input.previousSuspended)
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
      // The roster is the date's truth: any status but Suspended means the
      // club was reinstated.
      if (onRoster.clubStatus?.trim().toLowerCase() !== 'suspended') continue
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
    if (!previousKnown && mayBeMar31Suspension(row, snapshotDate)) continue
    const suspendDate = previous.get(row.clubNumber)?.suspendDate
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
