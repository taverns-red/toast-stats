/**
 * Zod validation schemas for time-series data types.
 *
 * These schemas provide runtime validation for time-series data,
 * ensuring that data written by collector-cli and read by backend conforms
 * to the expected structure.
 *
 * The schemas match the TypeScript interfaces in time-series.ts exactly.
 *
 * @module time-series.schema
 * @see Requirements 13.4
 */

import { z } from 'zod'

/**
 * Zod schema for club health counts breakdown.
 * Validates ClubHealthCounts interface structure.
 */
export const ClubHealthCountsSchema = z.object({
  /** Total number of clubs */
  total: z.number().int().nonnegative(),

  /** Number of thriving clubs */
  thriving: z.number().int().nonnegative(),

  /** Number of vulnerable clubs */
  vulnerable: z.number().int().nonnegative(),

  /** Number of clubs requiring intervention */
  interventionRequired: z.number().int().nonnegative(),
})

/**
 * Zod schema for a single time-series data point.
 * Validates TimeSeriesDataPoint interface structure.
 *
 * Contains aggregated metrics for a snapshot date.
 *
 * @example
 * ```typescript
 * const result = TimeSeriesDataPointSchema.safeParse(jsonData)
 * if (result.success) {
 *   const dataPoint = result.data
 *   console.log(`Date: ${dataPoint.date}, Membership: ${dataPoint.membership}`)
 * }
 * ```
 */
export const TimeSeriesDataPointSchema = z.object({
  /** Date of the snapshot in YYYY-MM-DD format */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),

  /** Unique identifier for the snapshot */
  snapshotId: z.string().min(1),

  /** Total membership count across all clubs */
  membership: z.number().int().nonnegative(),

  /** Total payments received */
  payments: z.number().int().nonnegative(),

  /** Total DCP goals achieved */
  dcpGoals: z.number().int().nonnegative(),

  /** Total number of distinguished clubs */
  distinguishedTotal: z.number().int().nonnegative(),

  /** Club health counts breakdown */
  clubCounts: ClubHealthCountsSchema,
})

/**
 * Zod schema for program year summary statistics.
 * Validates ProgramYearSummary interface structure.
 *
 * Pre-computed by collector-cli during the compute-analytics pipeline.
 */
export const ProgramYearSummarySchema = z.object({
  /** Total number of data points in the program year */
  totalDataPoints: z.number().int().nonnegative(),

  /** Membership count at the start of the program year */
  membershipStart: z.number().int().nonnegative(),

  /** Membership count at the end of the program year */
  membershipEnd: z.number().int().nonnegative(),

  /** Peak membership count during the program year */
  membershipPeak: z.number().int().nonnegative(),

  /** Lowest membership count during the program year */
  membershipLow: z.number().int().nonnegative(),
})

/**
 * Zod schema for program year index file.
 * Validates ProgramYearIndexFile interface structure.
 *
 * This is the main schema for validating program year index files
 * as stored in JSON files.
 *
 * @example
 * ```typescript
 * const result = ProgramYearIndexFileSchema.safeParse(jsonData)
 * if (result.success) {
 *   const indexFile = result.data
 *   console.log(`District: ${indexFile.districtId}, Year: ${indexFile.programYear}`)
 *   console.log(`Data points: ${indexFile.dataPoints.length}`)
 * }
 * ```
 */
export const ProgramYearIndexFileSchema = z.object({
  /** District identifier (e.g., "42", "F") */
  districtId: z.string().min(1),

  /** Program year identifier (e.g., "2023-2024") */
  programYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'Program year must be in YYYY-YYYY format'),

  /** Start date of the program year (e.g., "2023-07-01") */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),

  /** End date of the program year (e.g., "2024-06-30") */
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),

  /** ISO timestamp when the index was last updated */
  lastUpdated: z
    .string()
    .datetime({ message: 'lastUpdated must be a valid ISO timestamp' }),

  /** Array of time-series data points for this program year */
  dataPoints: z.array(TimeSeriesDataPointSchema),

  /** Pre-computed summary statistics for this program year */
  summary: ProgramYearSummarySchema,

  /**
   * Dates the district was not measured: a #1671 source gap recorded in the
   * date's snapshot metadata. No data point exists for them (#2070).
   */
  sourceGapDates: z
    .array(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    )
    .optional(),
})

/**
 * Zod schema for time-series index metadata.
 * Validates TimeSeriesIndexMetadata interface structure.
 *
 * Provides an overview of available data for a district.
 *
 * @example
 * ```typescript
 * const result = TimeSeriesIndexMetadataSchema.safeParse(jsonData)
 * if (result.success) {
 *   const metadata = result.data
 *   console.log(`District: ${metadata.districtId}`)
 *   console.log(`Available years: ${metadata.availableProgramYears.join(', ')}`)
 * }
 * ```
 */
export const TimeSeriesIndexMetadataSchema = z.object({
  /** District identifier (e.g., "42", "F") */
  districtId: z.string().min(1),

  /** ISO timestamp when the metadata was last updated */
  lastUpdated: z
    .string()
    .datetime({ message: 'lastUpdated must be a valid ISO timestamp' }),

  /** List of available program years (e.g., ["2022-2023", "2023-2024"]) */
  availableProgramYears: z.array(
    z
      .string()
      .regex(/^\d{4}-\d{4}$/, 'Program year must be in YYYY-YYYY format')
  ),

  /** Total number of data points across all program years */
  totalDataPoints: z.number().int().nonnegative(),
})

/**
 * TypeScript type inferred from ClubHealthCountsSchema.
 * Can be used for type-safe validation results.
 */
export type ClubHealthCountsSchemaType = z.infer<typeof ClubHealthCountsSchema>

/**
 * TypeScript type inferred from TimeSeriesDataPointSchema.
 * Can be used for type-safe validation results.
 */
export type TimeSeriesDataPointSchemaType = z.infer<
  typeof TimeSeriesDataPointSchema
>

/**
 * TypeScript type inferred from ProgramYearSummarySchema.
 * Can be used for type-safe validation results.
 */
export type ProgramYearSummarySchemaType = z.infer<
  typeof ProgramYearSummarySchema
>

/**
 * TypeScript type inferred from ProgramYearIndexFileSchema.
 * Can be used for type-safe validation results.
 */
export type ProgramYearIndexFileSchemaType = z.infer<
  typeof ProgramYearIndexFileSchema
>

/**
 * TypeScript type inferred from TimeSeriesIndexMetadataSchema.
 * Can be used for type-safe validation results.
 */
export type TimeSeriesIndexMetadataSchemaType = z.infer<
  typeof TimeSeriesIndexMetadataSchema
>
