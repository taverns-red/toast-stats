// packages/shared-contracts/src/index.ts

// Version constants
export {
  SCHEMA_VERSION,
  CALCULATION_VERSION,
  RANKING_VERSION,
  isSchemaCompatible,
} from './version.js'

// File format types
export type { PerDistrictData } from './types/per-district-data.js'

export type {
  ScrapedRecord,
  ScrapedRecordValue,
  ScrapedRecordCoordinates,
  ScrapedRecordAddress,
} from './types/scraped-record.js'

export type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
  DivisionStatisticsFile,
  AreaStatisticsFile,
  DistrictTotalsFile,
  ProspectiveClub,
} from './types/district-statistics-file.js'

export type {
  AllDistrictsRankingsData,
  AllDistrictsRankingsMetadata,
  DistrictRanking,
} from './types/all-districts-rankings.js'

export type { SnapshotMetadataFile } from './types/snapshot-metadata.js'

export type {
  SnapshotManifest,
  DistrictManifestEntry,
} from './types/snapshot-manifest.js'

// Snapshot pointer type
export type { SnapshotPointer } from './types/snapshot-pointer.js'

// Time-series types
export type {
  TimeSeriesDataPoint,
  ProgramYearIndexFile,
  ProgramYearSummary,
  TimeSeriesIndexMetadata,
  ClubHealthCounts,
} from './types/time-series.js'

// Club health status types
export type { ClubHealthStatus } from './types/club-health-status.js'

// API response types (shared between frontend and backend)
export type {
  ProgramYearWithData,
  AvailableRankingYearsResponse,
} from './types/api-responses.js'

// Zod schemas
export { PerDistrictDataSchema } from './schemas/per-district-data.schema.js'

export {
  DistrictStatisticsFileSchema,
  ClubStatisticsFileSchema,
  DivisionStatisticsFileSchema,
  AreaStatisticsFileSchema,
  DistrictTotalsFileSchema,
  ScrapedRecordSchema,
  ProspectiveClubSchema,
} from './schemas/district-statistics-file.schema.js'

export {
  AllDistrictsRankingsDataSchema,
  AllDistrictsRankingsMetadataSchema,
  DistrictRankingSchema,
} from './schemas/all-districts-rankings.schema.js'

export { SnapshotMetadataFileSchema } from './schemas/snapshot-metadata.schema.js'

export {
  SnapshotManifestSchema,
  DistrictManifestEntrySchema,
} from './schemas/snapshot-manifest.schema.js'

// Snapshot pointer Zod schema
export {
  SnapshotPointerSchema,
  type SnapshotPointerSchemaType,
} from './schemas/snapshot-pointer.schema.js'

// Time-series Zod schemas
export {
  TimeSeriesDataPointSchema,
  ProgramYearIndexFileSchema,
  ProgramYearSummarySchema,
  TimeSeriesIndexMetadataSchema,
  ClubHealthCountsSchema,
} from './schemas/time-series.schema.js'

// Club health status Zod schemas
export {
  ClubHealthStatusSchema,
  type ClubHealthStatusSchemaType,
} from './schemas/club-health-status.schema.js'

// Snapshot diff ("What Changed", epic #797) — schema + inferred types
export {
  AggregateDeltaSchema,
  DiffEventCategorySchema,
  ClubDiffSchema,
  ClubPresenceSchema,
  DiffEventSchema,
  SnapshotDiffSideSchema,
  SnapshotDiffTotalsSchema,
  RosterDiscontinuitySchema,
  SnapshotDiffSchema,
  type AggregateDelta,
  type DiffEventCategory,
  type ClubDiff,
  type ClubPresence,
  type DiffEvent,
  type SnapshotDiffSide,
  type SnapshotDiffTotals,
  type RosterDiscontinuity,
  type SnapshotDiff,
} from './schemas/snapshot-diff.schema.js'

// Daily Reports de-identified dataset (epic #1062) — schema + inferred types
export {
  ReportSourceSchema,
  DuesRenewalRecordSchema,
  OfficerListRecordSchema,
  ClubSuccessPlanRecordSchema,
  EducationAchievementActivityRecordSchema,
  NewClubRecordSchema,
  ProspectiveClubRecordSchema,
  CoachRecordSchema,
  TripleCrownSummarySchema,
  DistrictReportsSectionsSchema,
  DistrictReportsDatasetSchema,
  type ReportSource,
  type DuesRenewalRecord,
  type OfficerListRecord,
  type ClubSuccessPlanRecord,
  type EducationAchievementActivityRecord,
  type NewClubRecord,
  type ProspectiveClubRecord,
  type CoachRecord,
  type TripleCrownSummary,
  type DistrictReportsSections,
  type DistrictReportsDataset,
} from './schemas/district-reports.schema.js'

// Validation helpers
export {
  validatePerDistrictData,
  validateAllDistrictsRankings,
  validateSnapshotMetadata,
  validateSnapshotManifest,
  validateSnapshotPointer,
  validateTimeSeriesDataPoint,
  validateProgramYearIndexFile,
  validateTimeSeriesIndexMetadata,
  validateProgramYearSummary,
  type ValidationResult,
} from './validation/validators.js'

// Canonical snapshot file naming (#1428) — the one matcher that decides what
// `district_<id>.json` means, shared by scripts/ and collector-cli so the
// daily-reports sidecar cannot be mistaken for a district snapshot.
export {
  DISTRICT_SNAPSHOT_FILE_PATTERN,
  DISTRICT_SNAPSHOT_OBJECT_PATTERN,
  isDistrictSnapshotFile,
  districtIdFromSnapshotFileName,
  parseDistrictSnapshotObjectName,
  indexDistrictSnapshotObjects,
  type DistrictSnapshotObject,
  type DistrictSnapshotDateIndex,
} from './naming/snapshotFileNames.js'

// Canonical club-id comparison (#1437) — Toastmasters emits both `00009905`
// and `9905`, so identity is the normalized form, never a strict `===`.
// #1440 adopts this at the remaining call sites and adds `findClubEntry`, the
// same rule for object keys (the club index is keyed by whichever form the
// snapshot that generated it stored).
export {
  normalizeClubId,
  clubIdsMatch,
  findClubEntry,
} from './naming/clubId.js'
