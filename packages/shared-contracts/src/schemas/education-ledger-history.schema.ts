/**
 * Zod contract for the education ledger history (#1802, epic #1781).
 *
 * TI's Educational Achievement Archive (`GetDistrictReport`, tableID
 * `a30b93f3-…`) returns one program year's full award ledger per district,
 * PY 2003-04 → the last closed PY, one row per achievement with a `Date`.
 * The reports dataset (`district_<id>_reports.json`) drops `Date` and counts
 * per (club, award) for the PY as a whole (Lesson 153). This store keeps it:
 * one record per (club, award, yearMonth), so a month-end total within any
 * past year is a filter on `yearMonth` (`ledgerRecordsThroughMonth`).
 *
 * Month, not day: 2003-04 dates are month precision only (every Date is the
 * 1st), 2004-05 is mixed, and a day key would make nearly every group a single
 * achievement again. The year is kept as TI reports it, not re-derived.
 *
 * Privacy: the archive has no Member column; `Name` is the club name. Records
 * are strict objects, so no member or per-row date can be carried.
 *
 * `status`:
 * - `ok`      — TI returned the ledger (it may, in principle, have no rows);
 * - `no-data` — TI returned an empty body: the district did not exist that
 *               program year (e.g. D228 in 2010-11). Never an error, and a
 *               consumer reads it as "not available", never as 0.
 * A district with no file was not fetched; that is also "not available".
 *
 * Path: `raw-education-ledger/<PY>/district_<id>.json`, plain JSON, in the
 * STAGING bucket only. Nothing promotes this prefix; the rollup that reads it
 * (#1801) is promoted after ADR-015 step 5 (#1763).
 *
 * @module education-ledger-history.schema
 */

import { z } from 'zod'
import type { EducationAwardProgram } from '../education/educationAwardProgram.js'

export const EDUCATION_LEDGER_HISTORY_VERSION = '1.0.0'

/** The staging-only raw prefix the ledger history lives under. */
export const EDUCATION_LEDGER_HISTORY_PREFIX = 'raw-education-ledger'

const ProgramYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/)
  .refine(py => Number(py.slice(5)) === Number(py.slice(0, 4)) + 1, {
    message: 'program year must be consecutive years, e.g. 2018-2019',
  })

const DistrictId = z.string().regex(/^[A-Za-z0-9]+$/)

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const EducationAwardProgramSchema = z.enum([
  'Pathways',
  'Legacy',
  'DTM',
  'Other',
]) satisfies z.ZodType<EducationAwardProgram>

/** One (club, award, month) group of the ledger. */
export const EducationLedgerMonthRecordSchema = z
  .object({
    club: z.string(),
    /** Division and area as of that program year (clubs move). */
    division: z.string(),
    area: z.string(),
    /** "Name" = the club name. */
    name: z.string(),
    location: z.string(),
    /** The award as TI renders it: code + title, e.g. `CCCompetent Communicator`. */
    award: z.string(),
    /** The bare code, e.g. `CC`; '' when TI renders none (a pending award). */
    awardCode: z.string(),
    program: EducationAwardProgramSchema,
    /** `YYYY-MM` of the achievement's Date. */
    yearMonth: z.string().regex(YEAR_MONTH),
    /** Achievements in this group: raw award rows, NOT DCP credit. */
    achievementCount: z.number().int().positive(),
  })
  .strict()
export type EducationLedgerMonthRecord = z.infer<
  typeof EducationLedgerMonthRecordSchema
>

export const EducationLedgerHistoryFileSchema = z
  .object({
    schemaVersion: z.literal(EDUCATION_LEDGER_HISTORY_VERSION),
    districtId: DistrictId,
    programYear: ProgramYear,
    /** When the archive was fetched (ISO). */
    fetchedAt: z.string().datetime(),
    source: z
      .object({
        reportType: z.literal('education-archive'),
        tableId: z.string(),
      })
      .strict(),
    status: z.enum(['ok', 'no-data']),
    records: z.array(EducationLedgerMonthRecordSchema),
  })
  .strict()
  .refine(f => f.status === 'ok' || f.records.length === 0, {
    message: 'a no-data file carries no records',
    path: ['records'],
  })
export type EducationLedgerHistoryFile = z.infer<
  typeof EducationLedgerHistoryFileSchema
>

/** `raw-education-ledger/<PY>/district_<id>.json` — validated, never raw input. */
export function educationLedgerHistoryObjectPath(
  programYear: string,
  districtId: string
): string {
  ProgramYear.parse(programYear)
  DistrictId.parse(districtId)
  return `${EDUCATION_LEDGER_HISTORY_PREFIX}/${programYear}/district_${districtId}.json`
}

/**
 * The records dated on or before `yearMonth` (`Date <= asOf` at month
 * granularity): the ledger as it stood at that month's end.
 */
export function ledgerRecordsThroughMonth<
  T extends Pick<EducationLedgerMonthRecord, 'yearMonth'>,
>(records: readonly T[], yearMonth: string): T[] {
  if (!YEAR_MONTH.test(yearMonth)) {
    throw new Error(
      `ledgerRecordsThroughMonth: expected YYYY-MM, got "${yearMonth}"`
    )
  }
  return records.filter(r => r.yearMonth <= yearMonth)
}
