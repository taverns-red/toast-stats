/**
 * Snapshot manifest file structure.
 * File location: snapshots/{date}/manifest.json
 *
 * This file contains a manifest of all district files in a snapshot,
 * including their status, file sizes, and optional rankings file info.
 */

/**
 * Individual district entry in the snapshot manifest.
 * Tracks the status and metadata for each district file.
 */
export interface DistrictManifestEntry {
  /** District identifier (e.g., "42", "F") */
  districtId: string
  /** Name of the district file (e.g., "district_42.json") */
  fileName: string
  /** Whether the district was processed successfully or failed */
  status: 'success' | 'failed'
  /** ISO timestamp when the file was last modified */
  lastModified: string
  /** Error message if status is 'failed' */
  errorMessage?: string
}

/**
 * Snapshot manifest file structure.
 * Contains a list of all district entries and summary statistics.
 */
export interface SnapshotManifest {
  /** Snapshot ID (date in YYYY-MM-DD format) */
  snapshotId: string
  /** ISO timestamp when manifest was created */
  createdAt: string
  /** List of district entries */
  districts: DistrictManifestEntry[]
  /** Total number of districts */
  totalDistricts: number
  /** Number of successful districts */
  successfulDistricts: number
  /** Number of failed districts */
  failedDistricts: number
  /** Whether the snapshot upload is complete. Set to true by collector-cli as the final step. */
  writeComplete?: boolean
  /** All districts rankings file info (optional) */
  allDistrictsRankings?: {
    /** Name of the rankings file */
    filename: string
    /** Size of the rankings file in bytes */
    size: number
    /** Whether the rankings file is present or missing */
    status: 'present' | 'missing'
  }
}
