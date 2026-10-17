/**
 * Zod contract for the closed-club name index (#2062; follows #1806).
 *
 * `config/club-index.json` is the current roster, so a closed club is not
 * in it. The club-district history (#1782) keeps closed clubs, but sharded
 * by club id: reachable by number, not by name. This index is the name side
 * of that fallback — every club the history has as closed (its last span
 * ends before the history's `asOf`), with only what a search result needs:
 *
 *   programYears[closedPY][lastDistrictId] = [[clubId, name, lastSeen], …]
 *
 * - `closedPY` is the program year of the club's last sighting (its last
 *   `byProgramYear` key, i.e. the PY of the snapshot's logical date).
 * - `name` is TI's published name at that sighting, kept as published.
 * - `lastSeen` is that sighting's date; omni-search labels the result
 *   "closed YYYY" from it, as the club-number fallback (#1806) does.
 * - No contact fields: a row is exactly three strings.
 *
 * Nesting by program year and district keeps the file small (~190 KB gzip
 * for ~13 400 closed clubs at 2026-10-15). Path:
 * `config/closed-club-names.json`, plain JSON (edge-compressed), promoted
 * with the run.
 *
 * @module closed-club-names.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)

export const CLOSED_CLUB_NAME_INDEX_VERSION = '1.0.0'

/** One closed club: canonical club id, published name, last sighting. */
export const ClosedClubNameRowSchema = z.tuple([
  z.string().min(1),
  z.string(),
  IsoDate,
])

export const ClosedClubNameIndexSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('closed-club-name-index'),
  }),
  /** The club-district history's `asOf`: a club seen then is not closed. */
  asOf: IsoDate,
  totalClubs: z.number().int().nonnegative(),
  /** Closed PY → last district id → rows sorted by club id. */
  programYears: z.record(
    ProgramYear,
    z.record(z.string().min(1), z.array(ClosedClubNameRowSchema))
  ),
})

export type ClosedClubNameRow = z.infer<typeof ClosedClubNameRowSchema>
export type ClosedClubNameIndex = z.infer<typeof ClosedClubNameIndexSchema>
