/**
 * Zod contract for `snapshots/{date}/reinstatable-clubs.json`: the suspended
 * and closed clubs that can still be reinstated, per district (#3007). It
 * feeds the "Can reinstate" section of the Club Growth page.
 *
 * `oldestPeriod`, `addsToBase` and `reason` come from `classifyReinstatement`
 * in analytics-core, which holds the rule and its sources. `reason` is one of
 * that function's stable codes, kept as a string here so a code added later
 * doesn't make an already-deployed reader reject the file (ADR 0019, R24).
 *
 * Presence carries meaning, as in suspended-clubs.json (#1757):
 * - no file for a date: unknown for every district;
 * - a district key absent: unknown for that district;
 * - `[]`: a measured zero.
 *
 * The writer emits eligible rows only: the schema has no `eligible` field, so
 * a club that `classifyReinstatement` marks not eligible is left out.
 *
 * Rows hold public club-level facts only. They are strict, so a person field
 * can never ride along.
 *
 * @module reinstatable-clubs.schema
 */

import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Format envelope, versioned like the other published artifacts. */
export const ReinstatableClubsFormatSchema = z.object({
  version: z.string(),
  type: z.literal('reinstatable-clubs'),
})

/** One suspended or closed club that can be reinstated. */
export const ReinstatableClubSchema = z
  .strictObject({
    /** Canonical club number (`normalizeClubId`), the same form as `clubs[].clubId`. */
    clubNumber: z.string().min(1),
    clubName: z.string(),
    /** Division letter as TM prints it. Absent for a closed club with no known division. */
    division: z.string().optional(),
    /** Area number as TM prints it. Absent for a closed club with no known area. */
    area: z.string().optional(),
    status: z.enum(['suspended', 'closed']),
    /** Suspended clubs: the `Susp` date, ISO `YYYY-MM-DD`. */
    suspendDate: z.string().regex(ISO_DATE).optional(),
    /** Closed clubs: the last snapshot date the club was on the roster. */
    lastSeen: z.string().regex(ISO_DATE).optional(),
    /** True: the closure is in the oldest renewal period, "confirm with World Headquarters". */
    oldestPeriod: z.boolean(),
    /** Whether reinstating now adds to the club base of `baseProgramYear`. */
    addsToBase: z.boolean(),
    /** Stable reason code from `classifyReinstatement`. */
    reason: z.string().min(1),
  })
  .superRefine((row, ctx) => {
    if (row.status === 'suspended' && row.suspendDate === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['suspendDate'],
        message: 'a suspended club needs its suspendDate',
      })
    }
    if (row.status === 'suspended' && row.lastSeen !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['lastSeen'],
        message: 'a suspended club has no lastSeen',
      })
    }
    if (row.status === 'closed' && row.lastSeen === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['lastSeen'],
        message: 'a closed club needs its lastSeen',
      })
    }
    if (row.status === 'closed' && row.suspendDate !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['suspendDate'],
        message: 'a closed club has no suspendDate',
      })
    }
  })

export const ReinstatableClubsSchema = z.strictObject({
  _format: ReinstatableClubsFormatSchema,
  /** The snapshot (logical) date the list describes. */
  snapshotDate: z.string().regex(ISO_DATE),
  /** The program year whose July 1 base a reinstatement on that date affects, `YYYY-YYYY`. */
  baseProgramYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/)
    .refine(v => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, {
      message: 'the end year must be the start year plus one',
    }),
  /** District id → its reinstatable clubs, in source order. */
  districts: z.record(z.string(), z.array(ReinstatableClubSchema)),
})

export type ReinstatableClubsFormat = z.infer<
  typeof ReinstatableClubsFormatSchema
>
export type ReinstatableClub = z.infer<typeof ReinstatableClubSchema>
export type ReinstatableClubs = z.infer<typeof ReinstatableClubsSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const REINSTATABLE_CLUBS_FORMAT: ReinstatableClubsFormat = {
  version: '1.0.0',
  type: 'reinstatable-clubs',
}

/** The published file name, so writer and reader cannot drift apart. */
export const REINSTATABLE_CLUBS_FILE_NAME = 'reinstatable-clubs.json'
