/**
 * Zod contract for the club-district history (#1782, epic #1781).
 *
 * The club is the key; the district is an attribute with a date range. Every
 * other store is keyed by (district, club), so a club that moved district in
 * the 2026 reformation (club 977: District 01 → District 201) loses its past
 * on every page. This artifact keeps it.
 *
 * Phase 1 is folded from the club-race stores (`club-race/{PY}/
 * first-reached.json`), which hold ONE district per club per program year —
 * the district at the club's latest sighting that year. So:
 * - `granularity` is `'program-year'`: a span's `from` is the first observed
 *   date of the program year in which the club first appeared there, not the
 *   club's exact first day. A mid-year move shows at the PY boundary. Phase 2
 *   (#1816) records date-exact change points.
 * - `to` is the club's `lastSeen` in the last program year of the span, or
 *   `null` when the club is still seen on the history's `asOf` date.
 * - A closed club stays, with `to` and `lastSeen` set.
 *
 * Sharded by the last two digits of the club id (`clubDistrictHistoryShardKey`):
 * the whole history is ~0.9 MB gzipped, so a reader fetches `index.json` (or
 * nothing) plus the one shard holding its club. Club ids are numeric-like, so
 * a shard's key order is not lexicographic (Lesson 158); the writer promises
 * identical bytes for any input order instead.
 *
 * Path: `config/club-district-history/{index,NN}.json`, served from the CDN
 * (plain JSON, `max-age=300`, edge-compressed) and promoted with the run.
 * Shards are written and promoted before the index that names them, and a
 * shard key never disappears.
 *
 * @module club-district-history.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const ShardKey = z.string().regex(/^\d{2}$/)

export const CLUB_DISTRICT_HISTORY_VERSION = '1.0.0'

/** One stretch of a club's life in one district. */
export const ClubDistrictSpanSchema = z.object({
  from: IsoDate,
  /** Last sighting in this district; `null` = still there on `asOf`. */
  to: IsoDate.nullable(),
  districtId: z.string().min(1),
})

/** One club's district history. */
export const ClubDistrictHistoryClubSchema = z.object({
  /** Name at the latest sighting. */
  name: z.string(),
  /** Earlier names, oldest first; empty when it never changed. */
  formerNames: z.array(z.string()),
  firstSeen: IsoDate,
  lastSeen: IsoDate,
  /** Chronological, non-overlapping. */
  spans: z.array(ClubDistrictSpanSchema).min(1),
  /** Program year → the district the club was in that year. */
  byProgramYear: z.record(ProgramYear, z.string().min(1)),
})

/**
 * A club that a single program year's store listed under two district ids
 * (two keys that normalise to one club id). Reported here, never resolved
 * silently; `byProgramYear` takes the sighting with the latest `lastSeen`
 * (ties: the higher district id) so the shard is still deterministic.
 */
export const ClubDistrictDuplicateSchema = z.object({
  clubId: z.string(),
  programYear: ProgramYear,
  sightings: z
    .array(
      z.object({
        districtId: z.string(),
        clubName: z.string(),
        lastSeen: IsoDate,
      })
    )
    .min(2),
})

export const ClubDistrictHistoryIndexSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('club-district-history-index'),
  }),
  /** Latest date any source store observed. */
  asOf: IsoDate,
  /** Latest `updatedAt` of the source stores (deterministic, not wall time). */
  sourcesUpdatedAt: z.string(),
  granularity: z.literal('program-year'),
  /** Program years folded, ascending. */
  programYears: z.array(ProgramYear),
  totalClubs: z.number().int().nonnegative(),
  /** Shard keys present, ascending. */
  shards: z.array(ShardKey),
  duplicates: z.array(ClubDistrictDuplicateSchema),
})

export const ClubDistrictHistoryShardSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('club-district-history-shard'),
  }),
  shard: ShardKey,
  asOf: IsoDate,
  clubs: z.record(z.string(), ClubDistrictHistoryClubSchema),
})

export type ClubDistrictSpan = z.infer<typeof ClubDistrictSpanSchema>
export type ClubDistrictHistoryClub = z.infer<
  typeof ClubDistrictHistoryClubSchema
>
export type ClubDistrictDuplicate = z.infer<typeof ClubDistrictDuplicateSchema>
export type ClubDistrictHistoryIndex = z.infer<
  typeof ClubDistrictHistoryIndexSchema
>
export type ClubDistrictHistoryShard = z.infer<
  typeof ClubDistrictHistoryShardSchema
>

/**
 * The shard holding a canonical club id: its last two digits, zero-padded
 * ("977" → "77", "1" → "01"). Readers and the writer share this one function.
 */
export function clubDistrictHistoryShardKey(clubId: string): string {
  const digits = clubId.replace(/\D/g, '')
  return digits.slice(-2).padStart(2, '0')
}
