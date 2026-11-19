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
 * - Closed clubs come from the closed-club index (`config/closed-club-names.json`),
 *   grouped by the district each club was last seen in. The index has no
 *   division or area, so those rows leave them out.
 * - A club in both lists is listed once, as suspended.
 * - Optional `previousSuspended` is the last suspended list of the previous
 *   program year. TI drops a club suspended on March 31 from the roster at the
 *   July rollover, so the closed index shows it as closed from then. By the
 *   FAQ it stays suspended until October 1, and reinstating it before then
 *   adds to the club base. When the club is on that list and the rule still
 *   treats it as suspended, it is listed as suspended, with the list's
 *   division and area.
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

export function buildReinstatableClubs(
  input: BuildReinstatableClubsInput
): ReinstatableClubs {
  const { snapshotDate, suspended, closed } = input
  const previous = indexSuspended(input.previousSuspended)

  const currentNumbers = new Set<string>()
  for (const clubs of Object.values(suspended.districts)) {
    for (const club of clubs) currentNumbers.add(club.clubNumber)
  }

  // Closed index rows by the district they were last seen in.
  const closedByDistrict = new Map<
    string,
    { clubNumber: string; clubName: string; lastSeen: string }[]
  >()
  for (const districts of Object.values(closed.programYears)) {
    for (const [districtId, rows] of Object.entries(districts)) {
      const list = closedByDistrict.get(districtId) ?? []
      for (const [clubNumber, clubName, lastSeen] of rows) {
        list.push({ clubNumber, clubName, lastSeen })
      }
      closedByDistrict.set(districtId, list)
    }
  }

  const districts: Record<string, ReinstatableClub[]> = {}
  for (const [districtId, clubs] of Object.entries(suspended.districts)) {
    const rows: ReinstatableClub[] = clubs.map(club =>
      suspendedRow(club, snapshotDate)
    )
    const fromClosed: ReinstatableClub[] = []
    for (const row of closedByDistrict.get(districtId) ?? []) {
      if (currentNumbers.has(row.clubNumber)) continue

      const earlier = previous.get(row.clubNumber)
      if (earlier) {
        const asSuspended = suspendedRow(earlier, snapshotDate)
        // After Oct 1 the club has closed: fall through to the closed rule.
        if (asSuspended.reason !== 'suspended_mar31_after_oct1') {
          fromClosed.push(asSuspended)
          continue
        }
      }

      const result = classifyReinstatement(
        { status: 'closed', lastSeen: row.lastSeen },
        snapshotDate
      )
      if (!result.eligible) continue
      fromClosed.push({
        clubNumber: row.clubNumber,
        clubName: row.clubName,
        status: 'closed',
        lastSeen: row.lastSeen,
        oldestPeriod: result.oldestPeriod,
        addsToBase: result.addsToBase,
        reason: result.reason,
      })
    }
    // Newest closure first; club number breaks ties so the file is stable.
    fromClosed.sort((a, b) => {
      const byDate = (b.lastSeen ?? b.suspendDate ?? '').localeCompare(
        a.lastSeen ?? a.suspendDate ?? ''
      )
      return byDate || a.clubNumber.localeCompare(b.clubNumber)
    })
    districts[districtId] = [...rows, ...fromClosed]
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
