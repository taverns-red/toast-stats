/**
 * Zod contract for `snapshots/{date}/region-rollups.json` — the region and
 * world rollups of the district figures (#1799, epic #1781).
 *
 * Region and world variants of the district surfaces (#1812, #1813, #1815)
 * need these rollups without fetching ~100 district snapshots. One file per
 * date, written by compute-analytics beside `global-totals.json` and
 * promoted with its date.
 *
 * Rules the shape encodes:
 * - **One entity set.** Every block is a grouping of the same deduplicated
 *   clubs, scoped by the date's own `all-districts-rankings.json`, so
 *   `world` = Σ `districts` and each region = Σ its `districtIds` for every
 *   count, by construction.
 * - **Each program year's own regions.** A district's region is
 *   `config/district-region-history.json`'s `byProgramYear` for the program
 *   year of the snapshot's LOGICAL date (the directory name), never of the
 *   date its CSVs were collected (a June close is collected in July).
 *   `regions` is `null` when there is no usable history; a district the
 *   history does not place (the undistricted bucket `U`, a new district) has
 *   `region: null` and is listed in `scope.unassignedDistricts`.
 * - **Absent is not zero.** A figure is `null` when its source column was
 *   not collected, and a block's figure is `null` when any of its districts'
 *   is (a partial sum would be an invisible understatement).
 *
 * Counts only: no club names, ids or person data.
 *
 * @module region-rollups.schema
 */

import { z } from 'zod'
import { OfficerTrainingDistributionSchema } from './time-series.schema.js'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()
const MaybeCount = Count.nullable()

export const REGION_ROLLUPS_VERSION = '1.0.0'

export const RegionRollupsFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('region-rollups'),
  })
  .strict()

/** The figures every block carries (district, region, world). */
export const RegionRollupFiguresSchema = z
  .object({
    clubs: Count,
    /** Σ active members (`membershipCount`). */
    membership: Count,
    /** Σ membership payments to date (`paymentsCount`). */
    payments: Count,
    /** The shared club-health rule (#1120) at the snapshot's month. */
    health: z
      .object({
        thriving: Count,
        vulnerable: Count,
        interventionRequired: Count,
      })
      .strict(),
    /** TI's club status column. */
    clubStatus: z
      .object({
        active: Count,
        low: Count,
        ineligible: Count,
        suspended: Count,
        other: Count,
      })
      .strict(),
    /**
     * Disjoint, highest level met (CSP-gated from 2025-26, the program
     * year's own ladder). `smedley` is null before 2025-26.
     */
    distinguished: z
      .object({
        smedley: MaybeCount,
        president: Count,
        select: Count,
        distinguished: Count,
        notDistinguished: Count,
      })
      .strict(),
    /** Clubs meeting each requirement; null = column not collected. */
    compliance: z
      .object({
        cspSubmitted: MaybeCount,
        octoberDuesOnTime: MaybeCount,
        aprilDuesOnTime: MaybeCount,
        officerListOnTime: MaybeCount,
      })
      .strict(),
    /**
     * `prospective`: Find-A-Club clubs not yet on the roster.
     * `chartered` / `suspended`: clubs on the roster whose charter / suspend
     * date falls in the program year up to the snapshot date.
     */
    growth: z
      .object({
        prospective: MaybeCount,
        chartered: MaybeCount,
        suspended: MaybeCount,
      })
      .strict(),
    /**
     * Clubs by officers trained per round, index 0–7 (#2296). null = the
     * export carried no officer-training column for some district in the
     * block; absent = a file written before the field existed.
     */
    officerTraining: OfficerTrainingDistributionSchema.nullable().optional(),
  })
  .strict()

export const RegionRollupDistrictSchema = RegionRollupFiguresSchema.extend({
  /** The district's region this program year; null = not placed. */
  region: z.string().min(1).nullable(),
}).strict()

export const RegionRollupRegionSchema = RegionRollupFiguresSchema.extend({
  /** The districts summed, ascending. */
  districtIds: z.array(z.string().min(1)).min(1),
}).strict()

export const RegionRollupWorldSchema = RegionRollupFiguresSchema.extend({
  districts: Count,
}).strict()

export const RegionRollupsSchema = z
  .object({
    _format: RegionRollupsFormatSchema,
    /** The snapshot's logical date (the directory name). */
    snapshotDate: IsoDate,
    /** The program year of `snapshotDate`. */
    programYear: ProgramYear,
    generatedAt: z.string(),
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
    scope: z
      .object({
        /** District files in the snapshot the date's rankings do not list. */
        excludedDistricts: z.array(z.string()),
        /** Districts with `region: null` while regions are available. */
        unassignedDistricts: z.array(z.string()),
        /** A club in two district files: counted once, in the first. */
        duplicateClubs: z.array(
          z
            .object({
              clubId: z.string(),
              districtIds: z.array(z.string()).min(2),
            })
            .strict()
        ),
      })
      .strict(),
    world: RegionRollupWorldSchema,
    /** Region id ("01".."14") → its rollup; null = regions not available. */
    regions: z.record(z.string(), RegionRollupRegionSchema).nullable(),
    /** Every in-scope district, keyed by its id. */
    districts: z.record(z.string(), RegionRollupDistrictSchema),
  })
  .strict()

export type RegionRollupsFormat = z.infer<typeof RegionRollupsFormatSchema>
export type RegionRollupFigures = z.infer<typeof RegionRollupFiguresSchema>
export type RegionRollupDistrict = z.infer<typeof RegionRollupDistrictSchema>
export type RegionRollupRegion = z.infer<typeof RegionRollupRegionSchema>
export type RegionRollupWorld = z.infer<typeof RegionRollupWorldSchema>
export type RegionRollups = z.infer<typeof RegionRollupsSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const REGION_ROLLUPS_FORMAT: RegionRollupsFormat = {
  version: REGION_ROLLUPS_VERSION,
  type: 'region-rollups',
}

/** The published file name, so writer and reader cannot drift apart. */
export const REGION_ROLLUPS_FILE_NAME = 'region-rollups.json'

/** Where compute-analytics reads region membership from (#1820). */
export const REGION_ROLLUPS_REGION_SOURCE =
  'config/district-region-history.json' as const
