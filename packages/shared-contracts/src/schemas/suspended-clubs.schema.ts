/**
 * Zod contract for `snapshots/{date}/suspended-clubs.json` — the clubs
 * suspended in the snapshot's program year, per district (#1953, epic #1781).
 *
 * It is the per-club list behind the rankings row's `suspendedClubs` count,
 * for the Club Growth funnel's Suspended stage (#1794). Suspended clubs can
 * leave the snapshot's `clubs[]`, so the list comes from the source that the
 * count reads: the `Susp MM/DD/YY` branch of `district-performance.csv`'s
 * `Charter Date/Suspend Date` column. The writer windows it by the same
 * logical-date program year, bounded at both ends (#1622, #1675), so a
 * district's row count equals its `suspendedClubs`.
 *
 * Presence carries meaning (#1757, the #1514 rule):
 * - no file for a date: unknown for every district (the date's source has no
 *   `Susp` value at all, as in TM's 2023-24 exports);
 * - a district key absent: unknown for that district (its source was not
 *   read), matching an absent `suspendedClubs`;
 * - `[]`: a measured zero.
 *
 * Rows hold public club-level facts only. They are strict, so a person field
 * can never ride along.
 *
 * @module suspended-clubs.schema
 */

import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Format envelope, versioned like the other published artifacts. */
export const SuspendedClubsFormatSchema = z.object({
  version: z.string(),
  type: z.literal('suspended-clubs'),
})

/** One club suspended in the program year. */
export const SuspendedClubSchema = z.strictObject({
  /** Canonical club number (`normalizeClubId`), the same form as `clubs[].clubId`. */
  clubNumber: z.string().min(1),
  clubName: z.string(),
  /** Division letter as TM prints it (e.g. `C`). */
  division: z.string(),
  /** Area number as TM prints it (e.g. `33`). */
  area: z.string(),
  /** The `Susp` date, ISO `YYYY-MM-DD`. */
  suspendDate: z.string().regex(ISO_DATE),
})

export const SuspendedClubsSchema = z.object({
  _format: SuspendedClubsFormatSchema,
  /** The snapshot (logical) date the list describes. */
  snapshotDate: z.string().regex(ISO_DATE),
  /** The program-year window applied, inclusive at both ends. */
  programYear: z.object({
    start: z.string().regex(ISO_DATE),
    end: z.string().regex(ISO_DATE),
  }),
  /** District id → its suspended clubs, in source order. */
  districts: z.record(z.string(), z.array(SuspendedClubSchema)),
})

export type SuspendedClubsFormat = z.infer<typeof SuspendedClubsFormatSchema>
export type SuspendedClub = z.infer<typeof SuspendedClubSchema>
export type SuspendedClubs = z.infer<typeof SuspendedClubsSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const SUSPENDED_CLUBS_FORMAT: SuspendedClubsFormat = {
  version: '1.0.0',
  type: 'suspended-clubs',
}

/** The published file name, so writer and reader cannot drift apart. */
export const SUSPENDED_CLUBS_FILE_NAME = 'suspended-clubs.json'
