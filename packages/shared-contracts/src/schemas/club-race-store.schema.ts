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
})

export const ClubRaceStoreSchema = z.object({
  _format: ClubRaceStoreFormatSchema,
  programYear: z.string(),
  updatedAt: z.string(),
  observedDates: z.array(IsoDate),
  clubs: z.record(z.string(), ClubRaceStoreClubSchema),
})

export type ClubRaceTier = z.infer<typeof ClubRaceTierSchema>
export type ClubRaceOfficialCode = z.infer<typeof ClubRaceOfficialCodeSchema>
export type ClubRaceStoreFormat = z.infer<typeof ClubRaceStoreFormatSchema>
export type ClubRaceCrossing = z.infer<typeof ClubRaceCrossingSchema>
export type ClubRaceStoreClub = z.infer<typeof ClubRaceStoreClubSchema>
export type ClubRaceStoreData = z.infer<typeof ClubRaceStoreSchema>

/** The `_format` envelope the store stamps on the file. */
export const CLUB_RACE_STORE_FORMAT: ClubRaceStoreFormat = {
  version: '1.0.0',
  type: 'club-race-store',
}
