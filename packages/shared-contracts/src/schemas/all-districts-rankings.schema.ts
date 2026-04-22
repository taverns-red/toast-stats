/**
 * Zod validation schemas for all-districts rankings file format.
 *
 * These schemas provide runtime validation for all-districts rankings data,
 * ensuring that data written by collector-cli and read by backend conforms
 * to the expected structure.
 *
 * The schemas match the TypeScript interfaces in all-districts-rankings.ts exactly.
 *
 * @module all-districts-rankings.schema
 * @see Requirements 6.1, 6.2, 6.3
 */

import { z } from 'zod'

/**
 * Zod schema for individual district ranking data.
 * Validates DistrictRanking interface structure.
 *
 * Contains all metrics and rank positions for a single district.
 */
export const DistrictRankingSchema = z.object({
  /** District identifier (e.g., "42", "F") */
  districtId: z.string(),

  /** Display name (e.g., "District 42") */
  districtName: z.string(),

  /** Geographic region */
  region: z.string(),

  /** Number of paid clubs */
  paidClubs: z.number(),

  /** Base number of paid clubs for growth calculation */
  paidClubBase: z.number(),

  /** Club growth percentage */
  clubGrowthPercent: z.number(),

  /** Total membership payments */
  totalPayments: z.number(),

  /** Base payments for growth calculation */
  paymentBase: z.number(),

  /** Payment growth percentage */
  paymentGrowthPercent: z.number(),

  /** Number of active clubs */
  activeClubs: z.number(),

  /** Number of distinguished clubs */
  distinguishedClubs: z.number(),

  /** Number of select distinguished clubs */
  selectDistinguished: z.number(),

  /** Number of president's distinguished clubs */
  presidentsDistinguished: z.number(),

  /** Percentage of distinguished clubs */
  distinguishedPercent: z.number(),

  /** Rank position for clubs metric */
  clubsRank: z.number(),

  /** Rank position for payments metric */
  paymentsRank: z.number(),

  /** Rank position for distinguished metric */
  distinguishedRank: z.number(),

  /** Aggregate score combining all metrics */
  aggregateScore: z.number(),

  /** Overall rank position based on aggregate score (1 = best, pre-computed) */
  overallRank: z.number(),

  /** Number of Smedley Distinguished clubs — new tier for 2025-2026 (#329) */
  smedleyDistinguished: z.number().optional(),

  /** District Success Plan submitted (Y/N from CSV) (#329) */
  dspSubmitted: z.boolean().optional(),

  /** 85% Director training completed (Y/N from CSV) (#329) */
  trainingMet: z.boolean().optional(),

  /** Market Analysis Plan submitted (Y/N from CSV) (#329) */
  marketAnalysisSubmitted: z.boolean().optional(),

  /** Communication Plan submitted (Y/N from CSV) (#329) */
  communicationPlanSubmitted: z.boolean().optional(),

  /** 2+ Region Advisor meetings completed (Y/N from CSV) (#329) */
  regionAdvisorVisitMet: z.boolean().optional(),

  /** Count of active clubs with 20+ paid members — for President's 20-Plus Award (#330) */
  clubsWith20PlusMembers: z.number().optional(),

  /**
   * Count of paid clubs chartered during the current program year (#336).
   * Used by CompetitiveAwardsCalculator to compute true base retention.
   */
  newCharteredClubs: z.number().optional(),

  /** Payment breakdown from All Districts CSV (#327) */
  newPayments: z.number().optional(),
  aprilPayments: z.number().optional(),
  octoberPayments: z.number().optional(),
  latePayments: z.number().optional(),
  charterPayments: z.number().optional(),
})

/**
 * Zod schema for all-districts rankings metadata.
 * Validates AllDistrictsRankingsMetadata interface structure.
 *
 * Contains information about the snapshot, calculation versions, and source data.
 */
export const AllDistrictsRankingsMetadataSchema = z.object({
  /** Snapshot ID (date in YYYY-MM-DD format) */
  snapshotId: z.string(),

  /** ISO timestamp when rankings were calculated */
  calculatedAt: z.string(),

  /** Schema version for compatibility checking */
  schemaVersion: z.string(),

  /** Calculation version for business logic compatibility */
  calculationVersion: z.string(),

  /** Ranking algorithm version */
  rankingVersion: z.string(),

  /** Source CSV date */
  sourceCsvDate: z.string(),

  /** When the source CSV was fetched */
  csvFetchedAt: z.string(),

  /** Total number of districts in rankings */
  totalDistricts: z.number(),

  /** Whether data came from cache */
  fromCache: z.boolean(),
})

/**
 * Zod schema for complete all-districts rankings file.
 * Validates AllDistrictsRankingsData interface structure.
 *
 * This is the main schema for validating all-districts rankings data
 * as stored in JSON files.
 *
 * @example
 * ```typescript
 * const result = AllDistrictsRankingsDataSchema.safeParse(jsonData)
 * if (result.success) {
 *   const rankingsData = result.data
 *   console.log(`Total districts: ${rankingsData.metadata.totalDistricts}`)
 *   console.log(`Rankings count: ${rankingsData.rankings.length}`)
 * }
 * ```
 */
export const AllDistrictsRankingsDataSchema = z.object({
  /** Metadata about the rankings calculation */
  metadata: AllDistrictsRankingsMetadataSchema,

  /** Array of district rankings */
  rankings: z.array(DistrictRankingSchema),
})

/**
 * TypeScript type inferred from DistrictRankingSchema.
 * Can be used for type-safe validation results.
 */
export type DistrictRankingSchemaType = z.infer<typeof DistrictRankingSchema>

/**
 * TypeScript type inferred from AllDistrictsRankingsMetadataSchema.
 * Can be used for type-safe validation results.
 */
export type AllDistrictsRankingsMetadataSchemaType = z.infer<
  typeof AllDistrictsRankingsMetadataSchema
>

/**
 * TypeScript type inferred from AllDistrictsRankingsDataSchema.
 * Can be used for type-safe validation results.
 */
export type AllDistrictsRankingsDataSchemaType = z.infer<
  typeof AllDistrictsRankingsDataSchema
>
