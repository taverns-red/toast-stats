/**
 * Zod validation schemas for snapshot manifest file format.
 *
 * These schemas provide runtime validation for snapshot manifest data,
 * ensuring that data written by collector-cli and read by backend conforms
 * to the expected structure.
 *
 * The schemas match the TypeScript interfaces in snapshot-manifest.ts exactly.
 *
 * @module snapshot-manifest.schema
 * @see Requirements 6.1, 6.2, 6.3
 */

import { z } from 'zod'

/**
 * Zod schema for individual district entry in the snapshot manifest.
 * Validates DistrictManifestEntry interface structure.
 *
 * Tracks the status and metadata for each district file in the snapshot.
 */
export const DistrictManifestEntrySchema = z.object({
  /** District identifier (e.g., "42", "F") */
  districtId: z.string(),

  /** Name of the district file (e.g., "district_42.json") */
  fileName: z.string(),

  /** Whether the district was processed successfully or failed */
  status: z.enum(['success', 'failed']),

  /** ISO timestamp when the file was last modified */
  lastModified: z.string(),

  /** Error message if status is 'failed' */
  errorMessage: z.string().optional(),
})

/**
 * Zod schema for snapshot manifest file.
 * Validates SnapshotManifest interface structure.
 *
 * This is the main schema for validating snapshot manifest data
 * as stored in manifest.json files.
 *
 * File location: snapshots/{date}/manifest.json
 */
export const SnapshotManifestSchema = z.object({
  /** Snapshot ID (date in YYYY-MM-DD format) */
  snapshotId: z.string(),

  /** ISO timestamp when manifest was created */
  createdAt: z.string(),

  /** List of district entries */
  districts: z.array(DistrictManifestEntrySchema),

  /** Total number of districts */
  totalDistricts: z.number(),

  /** Number of successful districts */
  successfulDistricts: z.number(),

  /** Number of failed districts */
  failedDistricts: z.number(),

  /** Whether the snapshot upload is complete. Set to true by collector-cli as the final step. */
  writeComplete: z.boolean().optional(),

  /** All districts rankings file info (optional) */
  allDistrictsRankings: z
    .object({
      /** Name of the rankings file */
      filename: z.string(),
      /** Size of the rankings file in bytes */
      size: z.number(),
      /** Whether the rankings file is present or missing */
      status: z.enum(['present', 'missing']),
    })
    .optional(),
})

/**
 * TypeScript type inferred from DistrictManifestEntrySchema.
 * Can be used for type-safe validation results.
 */
export type DistrictManifestEntrySchemaType = z.infer<
  typeof DistrictManifestEntrySchema
>

/**
 * TypeScript type inferred from SnapshotManifestSchema.
 * Can be used for type-safe validation results.
 */
export type SnapshotManifestSchemaType = z.infer<typeof SnapshotManifestSchema>
