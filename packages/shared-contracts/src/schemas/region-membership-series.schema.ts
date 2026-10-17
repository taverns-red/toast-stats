/**
 * Zod contract for `time-series/regions/{programYear}.json` — the region and
 * world membership series for one program year (#2127, follow-up to #1815).
 *
 * `/regions` draws one membership sparkline per region. Without this file
 * that takes one district time-series fetch per district (~94 per view);
 * with it, one small file.
 *
 * Rules the shape encodes:
 * - **Derived from the district series.** Each value is the sum of the
 *   member districts' `time-series/district_{id}/{PY}.json` `membership` at
 *   that date — the same points the region districts table's sparklines
 *   draw, so a region's line is the sum of its districts' lines.
 * - **The program year's own regions.** Membership is
 *   `config/district-region-history.json`'s `byProgramYear` for the file's
 *   program year, the region-rollups rule (#1799, #1820). Every date in the
 *   file belongs to that year. `regions` is null, with the reason, when
 *   there is no usable history; `world` is still built.
 * - **A gap is null, never 0.** A district with no point at a date (a #1671
 *   source gap the district series records in `sourceGapDates`, or simply no
 *   point) is listed in `uncountedDistricts` with its reason and dates, and
 *   every block containing it reads `null` at those dates. Leaving it out of
 *   the sum would draw a dip that never happened.
 *
 * Columnar to stay small: each `membership` array is aligned with `dates`.
 * Counts only: no club or person data.
 *
 * @module region-membership-series.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()

export const REGION_MEMBERSHIP_SERIES_VERSION = '1.0.0'

export const RegionMembershipSeriesFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('region-membership-series'),
  })
  .strict()

/** One series: Σ members' membership per date, null where one is uncounted. */
const MembershipValues = z.array(Count.nullable())

export const RegionMembershipSeriesRegionSchema = z
  .object({
    /** The region's districts for this program year, sorted. */
    districtIds: z.array(z.string()).min(1),
    membership: MembershipValues,
  })
  .strict()

export const RegionMembershipSeriesWorldSchema = z
  .object({
    /**
     * The districts the history places in a region for this program year:
     * the world is Σ the regions. The undistricted bucket `U` and any
     * district the history does not place (a renumbered id stamped onto an
     * earlier year's date, #1465) are listed in `unassignedDistricts`, not
     * summed.
     */
    districts: Count,
    membership: MembershipValues,
  })
  .strict()

/** A district left out of the sums at some dates (#2042's shape + dates). */
export const RegionMembershipSeriesUncountedSchema = z
  .object({
    districtId: z.string(),
    reason: z.string(),
    /** The dates it has no point at, sorted. */
    dates: z.array(IsoDate).min(1),
  })
  .strict()

export const RegionMembershipSeriesSchema = z
  .object({
    _format: RegionMembershipSeriesFormatSchema,
    programYear: ProgramYear,
    /** Where the regions came from; null when they are not available. */
    regionMembership: z
      .object({
        source: z.literal('config/district-region-history.json'),
        asOf: IsoDate,
        programYear: ProgramYear,
      })
      .strict()
      .nullable(),
    /** Why `regions` is null; null when regions are available. */
    regionMembershipNote: z.string().nullable(),
    /** Every date any placed district has a point at, sorted ascending. */
    dates: z.array(IsoDate),
    world: RegionMembershipSeriesWorldSchema,
    /** Region id ("01".."14") → its series; null = regions not available. */
    regions: z
      .record(z.string(), RegionMembershipSeriesRegionSchema)
      .nullable(),
    /** Districts with a series the history places in no region. */
    unassignedDistricts: z.array(z.string()),
    uncountedDistricts: z.array(RegionMembershipSeriesUncountedSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const n = value.dates.length
    const check = (
      values: readonly unknown[],
      path: (string | number)[]
    ): void => {
      if (values.length !== n)
        ctx.addIssue({
          code: 'custom',
          path,
          message: `has ${values.length} values for ${n} dates`,
        })
    }
    check(value.world.membership, ['world', 'membership'])
    for (const [id, region] of Object.entries(value.regions ?? {}))
      check(region.membership, ['regions', id, 'membership'])
  })

export type RegionMembershipSeriesFormat = z.infer<
  typeof RegionMembershipSeriesFormatSchema
>
export type RegionMembershipSeriesRegion = z.infer<
  typeof RegionMembershipSeriesRegionSchema
>
export type RegionMembershipSeriesWorld = z.infer<
  typeof RegionMembershipSeriesWorldSchema
>
export type RegionMembershipSeriesUncounted = z.infer<
  typeof RegionMembershipSeriesUncountedSchema
>
export type RegionMembershipSeries = z.infer<
  typeof RegionMembershipSeriesSchema
>

/** The `_format` envelope every writer stamps on the artifact. */
export const REGION_MEMBERSHIP_SERIES_FORMAT: RegionMembershipSeriesFormat = {
  version: REGION_MEMBERSHIP_SERIES_VERSION,
  type: 'region-membership-series',
}

/** The directory under `time-series/` the artifact lives in. */
export const REGION_MEMBERSHIP_SERIES_DIR = 'regions'

/** `time-series/regions/{programYear}.json`, relative to the bucket root. */
export function regionMembershipSeriesPath(programYear: string): string {
  return `time-series/${REGION_MEMBERSHIP_SERIES_DIR}/${programYear}.json`
}
