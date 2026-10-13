/**
 * Zod contract for the district → region history (#1820, epic #1781).
 *
 * Regions have been redrawn several times since the earliest snapshot
 * (District 61 alone has sat in Regions 06, 09 and 05), and the 2026
 * reformation retired 64 districts. Region pages and rollups must use each
 * program year's own membership, not today's. Same pattern as the
 * club-district history (#1782): the district is the key, the region an
 * attribute with a date range.
 *
 * Source (verified 2026-10-11 against staging, one file per year-end): the
 * `region` column of `snapshots/<date>/all-districts-rankings.json`, present
 * at every year-end from the earliest snapshot (2017) to today as a
 * two-digit string "01".."14";
 * the undistricted row (`districtId` "U", region "DNAR") is not a district
 * and is left out. The history is folded from the first and last snapshot
 * of each program year, so:
 * - a span's `from`/`to` are the first/last of those sampled dates on which
 *   the district was in that region (`to: null` = still there on `asOf`);
 * - a district seen in two regions within one program year is listed in
 *   `conflicts[]`, never silently resolved; `byProgramYear` then holds the
 *   region at the year's LAST sampled date;
 * - a retired district stays, with `to` set.
 *
 * Path: `config/district-region-history.json`, promoted with the run and
 * schema-checked by the promotion content gate (#1820).
 *
 * @module district-region-history.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)

export const DISTRICT_REGION_HISTORY_VERSION = '1.0.0'

export const DistrictRegionSpanSchema = z.object({
  from: IsoDate,
  /** Last sampled date in this region; `null` = still there on `asOf`. */
  to: IsoDate.nullable(),
  region: z.string().min(1),
})

export const DistrictRegionHistoryDistrictSchema = z.object({
  /** Chronological, non-overlapping. */
  spans: z.array(DistrictRegionSpanSchema).min(1),
  /** Program year → the district's region that year. */
  byProgramYear: z.record(ProgramYear, z.string().min(1)),
})

export const DistrictRegionConflictSchema = z.object({
  districtId: z.string(),
  programYear: ProgramYear,
  regions: z
    .array(
      z.object({
        region: z.string(),
        firstSeen: IsoDate,
        lastSeen: IsoDate,
      })
    )
    .min(2),
})

export const DistrictRegionHistorySchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('district-region-history'),
  }),
  /** Latest snapshot date folded. */
  asOf: IsoDate,
  /** Program years folded, ascending. */
  programYears: z.array(ProgramYear),
  /** The snapshot dates whose rankings were read, ascending. */
  sourceDates: z.array(IsoDate),
  districts: z.record(z.string(), DistrictRegionHistoryDistrictSchema),
  conflicts: z.array(DistrictRegionConflictSchema),
})

export type DistrictRegionSpan = z.infer<typeof DistrictRegionSpanSchema>
export type DistrictRegionHistoryDistrict = z.infer<
  typeof DistrictRegionHistoryDistrictSchema
>
export type DistrictRegionConflict = z.infer<
  typeof DistrictRegionConflictSchema
>
export type DistrictRegionHistory = z.infer<typeof DistrictRegionHistorySchema>
