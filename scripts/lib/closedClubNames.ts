/**
 * Closed-club name index (#2062; follows #1806).
 *
 * A pure derivation from the club-district history artifact (ADR-015 P2:
 * persisted inputs only), built in the same run as the history it reads, so
 * the two always agree on which clubs are closed: exactly the clubs whose
 * last span has an end (`to !== null`), the same rule the club-number
 * fallback applies (`closedClubSummary`, frontend). Those are the clubs
 * absent from `club-index.json`, which is built from the newest snapshot.
 *
 * Determinism: program years and districts are sorted, rows sorted by club
 * id; JSON object key order for integer-like district ids is the engine's
 * ascending numeric order either way (Lesson 158), so the bytes do not
 * depend on input order.
 */

import {
  CLOSED_CLUB_NAME_INDEX_VERSION,
  type ClosedClubNameIndex,
  type ClosedClubNameRow,
} from '@taverns-red/shared-contracts'
import type { ClubDistrictHistoryArtifact } from './clubDistrictHistory.js'

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function buildClosedClubNameIndex(
  history: ClubDistrictHistoryArtifact
): ClosedClubNameIndex {
  const grouped = new Map<string, Map<string, ClosedClubNameRow[]>>()
  let totalClubs = 0

  for (const shard of Object.values(history.shards)) {
    for (const [clubId, club] of Object.entries(shard.clubs)) {
      const last = club.spans[club.spans.length - 1]
      if (!last || last.to === null) continue
      const closedPy = Object.keys(club.byProgramYear).sort(byString).at(-1)
      if (!closedPy) continue
      const byDistrict = grouped.get(closedPy) ?? new Map()
      grouped.set(closedPy, byDistrict)
      const rows = byDistrict.get(last.districtId) ?? []
      byDistrict.set(last.districtId, rows)
      rows.push([clubId, club.name, club.lastSeen])
      totalClubs++
    }
  }

  const programYears: ClosedClubNameIndex['programYears'] = {}
  for (const py of [...grouped.keys()].sort(byString)) {
    const byDistrict = grouped.get(py)!
    const out: Record<string, ClosedClubNameRow[]> = {}
    for (const districtId of [...byDistrict.keys()].sort(byString)) {
      out[districtId] = byDistrict
        .get(districtId)!
        .sort((a, b) => byString(a[0], b[0]))
    }
    programYears[py] = out
  }

  return {
    _format: {
      version: CLOSED_CLUB_NAME_INDEX_VERSION,
      type: 'closed-club-name-index',
    },
    asOf: history.index.asOf,
    totalClubs,
    programYears,
  }
}
