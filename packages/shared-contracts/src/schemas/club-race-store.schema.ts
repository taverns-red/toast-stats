/**
 * Zod contract for `club-race/{programYear}/first-reached.json` — the
 * collector's crossing-date store behind the worldwide race to
 * Distinguished (#1556, spec `docs/specs/global-club-rankings.md` §3.2).
 *
 * Internal state (R9 pattern), not a CDN artifact, but shared here because
 * two packages read the shape: collector-cli writes it, analytics-core
 * projects it into `global-club-race.json`. One definition, no drift.
 *
 * Semantics the shape encodes:
 * - `reached[tier].on` is **sticky** — written on the first snapshot date
 *   the tier's requirements were met and never revised by a later drop.
 * - `after` is the observed snapshot date immediately before `on`, `null`
 *   when `on` is the earliest date the store has ever seen. A consumer
 *   renders "between A and B", never a point, when the two differ by more
 *   than a day.
 * - `observedDates` is every date ever upserted, ascending — `after` is a
 *   projection of it.
 *
 * @module club-race-store.schema
 */

import { z } from 'zod'

/** ISO calendar date, YYYY-MM-DD. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The Distinguished tiers a club can cross, lowest first. */
export const CLUB_RACE_TIERS = [
  'Distinguished',
  'Select',
  'President',
  'Smedley',
] as const

export const ClubRaceTierSchema = z.enum(CLUB_RACE_TIERS)

/** TI's official 'Club Distinguished Status' letter codes. */
export const ClubRaceOfficialCodeSchema = z.enum(['D', 'S', 'P', 'M'])

export const ClubRaceStoreFormatSchema = z.object({
  version: z.string(),
  type: z.literal('club-race-store'),
})

/** A dated crossing: first snapshot seen on, and the observed one before. */
export const ClubRaceCrossingSchema = z.object({
  on: IsoDate,
  after: IsoDate.nullable(),
})

/** The first and last snapshot dates one official code was observed. */
export const ClubRaceCodeSpanSchema = z.object({
  first: IsoDate,
  last: IsoDate,
})

/**
 * One district a club was listed under (#1816): the first and last snapshot
 * date it was seen there. Min/max folds, so any walk order converges and a
 * re-run date is a no-op (P4). A run wholly inside an earlier one is a
 * shadow listing, resolved by `resolveClubDistrictRuns`, never here.
 */
export const ClubRaceDistrictRunSchema = z.object({
  districtId: z.string(),
  from: IsoDate,
  to: IsoDate,
})

export const ClubRaceStoreClubSchema = z.object({
  /** Canonical club id (`normalizeClubId`), never the zero-padded form. */
  clubId: z.string(),
  clubName: z.string(),
  /** District at the club's latest sighting; a transfer never resets crossings. */
  districtId: z.string(),
  /** Latest snapshot date the club appeared in a district roster. */
  lastSeen: IsoDate,
  reached: z
    .object({
      Distinguished: ClubRaceCrossingSchema.optional(),
      Select: ClubRaceCrossingSchema.optional(),
      President: ClubRaceCrossingSchema.optional(),
      Smedley: ClubRaceCrossingSchema.optional(),
    })
    .strict(),
  /** First snapshot date TI's official code was seen, and which code. */
  official: ClubRaceCrossingSchema.extend({
    code: ClubRaceOfficialCodeSchema,
  }).optional(),
  /**
   * First and last snapshot date each official code was seen (#1689), so a
   * rebuild of a past date can show the code the club held THEN. Min/max
   * folds make it order-independent. Absent on stores written before it;
   * the projection then falls back to `official`.
   */
  officialCodes: z
    .object({
      D: ClubRaceCodeSpanSchema.optional(),
      S: ClubRaceCodeSpanSchema.optional(),
      P: ClubRaceCodeSpanSchema.optional(),
      M: ClubRaceCodeSpanSchema.optional(),
    })
    .strict()
    .optional(),
  /**
   * Earliest snapshot date the club was seen in this program year (#1816).
   * Absent on entries written before change points were recorded.
   */
  firstSeen: IsoDate.optional(),
  /**
   * Every district the club was listed under this program year, one run
   * each (#1816). Absent on entries written before change points were
   * recorded; the club-district history then falls back to PY precision.
   */
  districtHistory: z.array(ClubRaceDistrictRunSchema).optional(),
})

export const ClubRaceStoreSchema = z.object({
  _format: ClubRaceStoreFormatSchema,
  programYear: z.string(),
  updatedAt: z.string(),
  observedDates: z.array(IsoDate),
  /**
   * Observed dates folded BEFORE change points were recorded (#1816), so no
   * `districtHistory` saw them; a rebuild of the date removes it. A change
   * point next to one is not date-exact. Absent = a store never folded with
   * change points: every observed date is such a gap.
   */
  districtHistoryGaps: z.array(IsoDate).optional(),
  clubs: z.record(z.string(), ClubRaceStoreClubSchema),
})

export type ClubRaceTier = z.infer<typeof ClubRaceTierSchema>
export type ClubRaceOfficialCode = z.infer<typeof ClubRaceOfficialCodeSchema>
export type ClubRaceStoreFormat = z.infer<typeof ClubRaceStoreFormatSchema>
export type ClubRaceCrossing = z.infer<typeof ClubRaceCrossingSchema>
export type ClubRaceCodeSpan = z.infer<typeof ClubRaceCodeSpanSchema>
export type ClubRaceDistrictRun = z.infer<typeof ClubRaceDistrictRunSchema>
export type ClubRaceStoreClub = z.infer<typeof ClubRaceStoreClubSchema>
export type ClubRaceStoreData = z.infer<typeof ClubRaceStoreSchema>

/** The `_format` envelope the store stamps on the file. */
export const CLUB_RACE_STORE_FORMAT: ClubRaceStoreFormat = {
  version: '1.0.0',
  type: 'club-race-store',
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The runs a reader can trust (#1816), oldest first. A run wholly inside an
 * earlier-starting (or equal, longer) run is a shadow listing — the club
 * listed under a second district while still in its first, e.g. a June
 * close collected under the next year's structure (#2079) — and is dropped:
 * it is not a change point. Order: `from`, then the longer run, then the
 * district id, so the result is independent of input order.
 */
export function resolveClubDistrictRuns(
  runs: readonly ClubRaceDistrictRun[] | undefined
): ClubRaceDistrictRun[] {
  const sorted = [...(runs ?? [])].sort(
    (a, b) =>
      byString(a.from, b.from) ||
      byString(b.to, a.to) ||
      byString(a.districtId, b.districtId)
  )
  const kept: ClubRaceDistrictRun[] = []
  for (const run of sorted) {
    const shadowed = kept.some(k => k.from <= run.from && run.to <= k.to)
    if (!shadowed) kept.push({ ...run })
  }
  return kept
}

/**
 * The district a club was in on `date` (#1816): the latest trusted run that
 * had started by then. Null when the record is absent or starts later.
 */
export function clubDistrictInForce(
  runs: readonly ClubRaceDistrictRun[] | undefined,
  date: string
): string | null {
  let inForce: string | null = null
  for (const run of resolveClubDistrictRuns(runs)) {
    if (run.from > date) break
    inForce = run.districtId
  }
  return inForce
}
