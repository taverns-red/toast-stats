/**
 * Zod contract for `config/legacy-suspension-deadlines.json` (#3103): the
 * suspension deadline of each club suspended before TI's suspend date reached
 * our data (the suspended lists start 2025-07-31).
 *
 * Built once by `scripts/build-legacy-suspension-deadlines.ts` from the
 * 2024-25 monthly district snapshots: for a club whose last run of Club
 * Status "Suspended" started in that history, the Sep 30 or Mar 31 deadline
 * just before the run's first snapshot. The five-period rule reads it for
 * closed clubs with no TI suspend date; a TI date always wins.
 *
 * The file stops mattering on `expires` (2027-10-01): by then even a
 * Mar 31 2025 suspension is in inactive period 6. A follow-up issue removes
 * the file and its reader after that date.
 *
 * Internal input (like `closed-club-names.json`), not a published artifact.
 *
 * @module legacy-suspension-deadlines.schema
 */

import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const LegacySuspensionDeadlinesSchema = z
  .strictObject({
    _format: z.object({
      version: z.string(),
      type: z.literal('legacy-suspension-deadlines'),
    }),
    /** When the generator ran, ISO date-time. */
    generatedAt: z.string().min(1),
    /** The first day the file no longer matters, ISO. */
    expires: z.string().regex(ISO_DATE),
    /** The snapshot dates the generator read, ascending. */
    sourceDates: z.array(z.string().regex(ISO_DATE)).min(1),
    /** Number of rows, so a reader can check nothing was lost. */
    rowCount: z.number().int().nonnegative(),
    /** sha256 (hex) of the canonical JSON of `rows` (keys sorted). */
    rowsSha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** Canonical club number → suspension deadline (Sep 30 or Mar 31), ISO. */
    rows: z.record(z.string().min(1), z.string().regex(ISO_DATE)),
  })
  .refine(f => Object.keys(f.rows).length === f.rowCount, {
    message: 'rowCount must equal the number of rows',
    path: ['rowCount'],
  })

export type LegacySuspensionDeadlines = z.infer<
  typeof LegacySuspensionDeadlinesSchema
>

export const LEGACY_SUSPENSION_DEADLINES_FORMAT: LegacySuspensionDeadlines['_format'] =
  { version: '1.0.0', type: 'legacy-suspension-deadlines' }

/** Bucket-relative path, also the path under the pipeline's cache dir. */
export const LEGACY_SUSPENSION_DEADLINES_PATH =
  'config/legacy-suspension-deadlines.json'

/** On this date a Mar 31 2025 suspension enters period 6: nothing left to date. */
export const LEGACY_SUSPENSION_DEADLINES_EXPIRES = '2027-10-01'
