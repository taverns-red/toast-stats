/**
 * Zod contract for `snapshots/<monthEnd>/revisions/index.json` — the record
 * of every revision TI served for a closing month during month-end
 * reconciliation (#2475).
 *
 * `snapshots/<monthEnd>/` stays the newest revision (and, after rollover,
 * the final close) because awards, DCP and YoY read it. Each revision is
 * ALSO kept, write-once, as `revisions/<asOf>/district_<id>.json`, where
 * `asOf` is the collection date (unique per raw-csv dir), so What Changed can
 * diff one reconciliation day against the next.
 *
 * Rules the shape encodes:
 * - **Order.** `revisions` is in strictly ascending `asOf` order, no repeats.
 * - **Revision 0** (`closing: false`) is the in-month view of the month end,
 *   captured before the first close overwrote it: its `asOf` IS the month
 *   end. It is optional (absent when recording began mid-close).
 * - **Closing revisions** (`closing: true`) have `asOf` after the month end.
 * - **`final`** is null until the rollover stamps it (phase 2); when set it
 *   names a listed revision.
 * - **`successfulDistricts`** per revision, so a reader can exclude a
 *   revision that lacks a district (#1671 gap) instead of reading a missing
 *   file as every club leaving.
 *
 * Tolerant reader: objects are not strict, so a later optional key never
 * breaks a reader that does not know it (#2183).
 *
 * @module reconciliation-revisions.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The directory under `snapshots/<monthEnd>/` that holds the revisions. */
export const RECONCILIATION_REVISIONS_DIR = 'revisions'

/** The index file name inside {@link RECONCILIATION_REVISIONS_DIR}. */
export const RECONCILIATION_REVISION_INDEX_FILE_NAME = 'index.json'

/** True when `date` (YYYY-MM-DD) is the last day of its month (UTC). */
function isLastDayOfMonth(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d === last
}

export const ReconciliationRevisionSchema = z.object({
  /** The collection date of the revision (revision 0: the month end). */
  asOf: IsoDate,
  /** ISO timestamp the revision's snapshot was written. */
  collectedAt: z.string().datetime(),
  /** false only for revision 0, the pre-close in-month view. */
  closing: z.boolean(),
  /** Districts whose `district_<id>.json` the revision holds. */
  successfulDistricts: z.array(z.string().min(1)),
})

export const ReconciliationRevisionIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    monthEnd: IsoDate,
    /** YYYY-MM of the closing month. */
    dataMonth: z.string().regex(/^\d{4}-\d{2}$/),
    revisions: z.array(ReconciliationRevisionSchema),
    /** The final close's `asOf`; null until the rollover stamps it. */
    final: IsoDate.nullable(),
  })
  .superRefine((index, ctx) => {
    if (!isLastDayOfMonth(index.monthEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthEnd'],
        message: `${index.monthEnd} is not the last day of its month`,
      })
    }
    if (index.dataMonth !== index.monthEnd.slice(0, 7)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataMonth'],
        message: `dataMonth ${index.dataMonth} disagrees with monthEnd ${index.monthEnd}`,
      })
    }
    index.revisions.forEach((r, i) => {
      const prev = index.revisions[i - 1]
      if (prev && !(prev.asOf < r.asOf)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions', i, 'asOf'],
          message: `revisions must be in strictly ascending asOf order (${prev.asOf} then ${r.asOf})`,
        })
      }
      const ok = r.closing ? r.asOf > index.monthEnd : r.asOf === index.monthEnd
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions', i, 'asOf'],
          message: r.closing
            ? `a closing revision's asOf (${r.asOf}) must be after the month end`
            : `revision 0's asOf (${r.asOf}) must be the month end`,
        })
      }
    })
    if (
      index.final !== null &&
      !index.revisions.some(r => r.asOf === index.final)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['final'],
        message: `final ${index.final} is not a listed revision`,
      })
    }
  })

export type ReconciliationRevision = z.infer<
  typeof ReconciliationRevisionSchema
>
export type ReconciliationRevisionIndex = z.infer<
  typeof ReconciliationRevisionIndexSchema
>

/** `snapshots/<monthEnd>/revisions/index.json` */
export function reconciliationRevisionIndexPath(monthEnd: string): string {
  return `snapshots/${monthEnd}/${RECONCILIATION_REVISIONS_DIR}/${RECONCILIATION_REVISION_INDEX_FILE_NAME}`
}

/** `snapshots/<monthEnd>/revisions/<asOf>/district_<id>.json` */
export function reconciliationRevisionDistrictPath(
  monthEnd: string,
  asOf: string,
  districtId: string
): string {
  return `snapshots/${monthEnd}/${RECONCILIATION_REVISIONS_DIR}/${asOf}/district_${districtId}.json`
}

/** True when `name`, relative to `snapshots/<date>/`, is a revision object. */
export function isReconciliationRevisionObject(name: string): boolean {
  return name.startsWith(`${RECONCILIATION_REVISIONS_DIR}/`)
}
