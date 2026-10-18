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
  MeetingScheduleEntry,
  MeetingWeekday,
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
  MeetingScheduleEntrySchema,
  MEETING_WEEKDAYS,
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
  EducationMembersRecordSchema,
  NewClubRecordSchema,
  ProspectiveClubRecordSchema,
  CoachRecordSchema,
  SponsorMentorRecordSchema,
  TripleCrownSummarySchema,
  DistrictReportsSectionsSchema,
  DistrictReportsDatasetSchema,
  type ReportSource,
  type DuesRenewalRecord,
  type OfficerListRecord,
  type ClubSuccessPlanRecord,
  type EducationAchievementActivityRecord,
  type EducationMembersRecord,
  type NewClubRecord,
  type ProspectiveClubRecord,
  type CoachRecord,
  type SponsorMentorRecord,
  type TripleCrownSummary,
  type DistrictReportsSections,
  type DistrictReportsDataset,
} from './schemas/district-reports.schema.js'

// Worldwide rollup artifact — snapshots/{date}/global-totals.json (#1498)
export {
  GlobalTotalsSchema,
  GlobalTotalsFormatSchema,
  GlobalTotalsDuplicateClubSchema,
  GlobalTotalsUncountedDistrictSchema,
  GlobalTotalsDistrictsSchema,
  GlobalTotalsMembershipSchema,
  GlobalTotalsDistinguishedClubsSchema,
  GlobalTotalsDistrictTiersSchema,
  GlobalTotalsDistinguishedDistrictsSchema,
  GlobalTotalsClubMovementSchema,
  GlobalTotalsCountrySchema,
  GlobalTotalsClubsByCountrySchema,
  GLOBAL_TOTALS_FORMAT,
  GLOBAL_TOTALS_FILE_NAME,
  type GlobalTotals,
  type GlobalTotalsFormat,
  type GlobalTotalsDuplicateClub,
  type GlobalTotalsUncountedDistrict,
  type GlobalTotalsDistricts,
  type GlobalTotalsMembership,
  type GlobalTotalsDistinguishedClubs,
  type GlobalTotalsDistrictTiers,
  type GlobalTotalsDistinguishedDistricts,
  type GlobalTotalsClubMovement,
  type GlobalTotalsCountry,
  type GlobalTotalsClubsByCountry,
} from './schemas/global-totals.schema.js'

// Clubs suspended this program year — snapshots/{date}/suspended-clubs.json (#1953)
export {
  SuspendedClubsSchema,
  SuspendedClubsFormatSchema,
  SuspendedClubSchema,
  SUSPENDED_CLUBS_FORMAT,
  SUSPENDED_CLUBS_FILE_NAME,
  type SuspendedClubs,
  type SuspendedClubsFormat,
  type SuspendedClub,
} from './schemas/suspended-clubs.schema.js'

// Club-race crossing store — club-race/{PY}/first-reached.json (#1556)
export {
  ClubRaceStoreSchema,
  ClubRaceStoreFormatSchema,
  ClubRaceStoreClubSchema,
  ClubRaceCrossingSchema,
  ClubRaceCodeSpanSchema,
  ClubRaceTierSchema,
  ClubRaceOfficialCodeSchema,
  CLUB_RACE_TIERS,
  CLUB_RACE_STORE_FORMAT,
  type ClubRaceStoreData,
  type ClubRaceStoreFormat,
  type ClubRaceStoreClub,
  type ClubRaceCrossing,
  type ClubRaceCodeSpan,
  type ClubRaceTier,
  type ClubRaceOfficialCode,
} from './schemas/club-race-store.schema.js'

// Club-district history — config/club-district-history/ (#1782)
export {
  ClubDistrictSpanSchema,
  ClubDistrictHistoryClubSchema,
  ClubDistrictDuplicateSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  CLUB_DISTRICT_HISTORY_VERSION,
  clubDistrictHistoryShardKey,
  type ClubDistrictSpan,
  type ClubDistrictHistoryClub,
  type ClubDistrictDuplicate,
  type ClubDistrictHistoryIndex,
  type ClubDistrictHistoryShard,
} from './schemas/club-district-history.schema.js'

// Charter cohort survival — config/charter-cohort-survival/district_<id>.json
// (#2061; the fold the survival page ran in the browser, #1817)
export {
  CohortYearCellSchema,
  CharterCohortSchema,
  PooledYearCellSchema,
  CharterCohortCurvesSchema,
  CharterCohortSurvivalFileSchema,
  CHARTER_COHORT_SURVIVAL_VERSION,
  CHARTER_COHORT_SURVIVAL_DIR,
  charterCohortSurvivalObjectPath,
  type CohortYearCell,
  type CharterCohort,
  type PooledYearCell,
  type CharterCohortCurves,
  type CharterCohortSurvivalFile,
} from './schemas/charter-cohort-survival.schema.js'
export {
  buildCharterCohortSurvival,
  buildCharterCohortSurvivalFile,
  charterCohortSurvivalFromFile,
  type CharterCohortSurvival,
  type BuildCharterCohortSurvivalInput,
  type BuildCharterCohortSurvivalFileInput,
} from './survival/charterCohortSurvival.js'

// District → region history — config/district-region-history.json (#1820)
export {
  DistrictRegionSpanSchema,
  DistrictRegionHistoryDistrictSchema,
  DistrictRegionConflictSchema,
  DistrictRegionHistorySchema,
  DISTRICT_REGION_HISTORY_VERSION,
  type DistrictRegionSpan,
  type DistrictRegionHistoryDistrict,
  type DistrictRegionConflict,
  type DistrictRegionHistory,
} from './schemas/district-region-history.schema.js'

// Region and world rollups — snapshots/{date}/region-rollups.json (#1799)
export {
  RegionRollupsSchema,
  RegionRollupsFormatSchema,
  RegionRollupFiguresSchema,
  RegionRollupDistrictSchema,
  RegionRollupRegionSchema,
  RegionRollupWorldSchema,
  REGION_ROLLUPS_VERSION,
  REGION_ROLLUPS_FORMAT,
  REGION_ROLLUPS_FILE_NAME,
  REGION_ROLLUPS_REGION_SOURCE,
  type RegionRollups,
  type RegionRollupsFormat,
  type RegionRollupFigures,
  type RegionRollupDistrict,
  type RegionRollupRegion,
  type RegionRollupWorld,
} from './schemas/region-rollups.schema.js'

// Per-region club shards + world file — snapshots/{date}/clubs-by-region/ (#1800)
export {
  ClubsByRegionClubSchema,
  ClubsByRegionHealthSchema,
  ClubsByRegionTierSchema,
  ClubsByRegionShardSchema,
  ClubsByRegionShardFormatSchema,
  ClubsByRegionPointSchema,
  ClubsByRegionWorldSchema,
  ClubsByRegionWorldFormatSchema,
  ClubsByRegionWorldPointsSchema,
  ClubsByRegionWorldPointsFormatSchema,
  CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME,
  CLUBS_BY_REGION_WORLD_POINTS_PATH,
  CLUBS_BY_REGION_WORLD_POINTS_FORMAT,
  CLUBS_BY_REGION_VERSION,
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  CLUBS_BY_REGION_UNASSIGNED,
  CLUBS_BY_REGION_TOP_N,
  CLUBS_BY_REGION_TOP_METRICS,
  CLUBS_BY_REGION_SHARD_FORMAT,
  CLUBS_BY_REGION_WORLD_FORMAT,
  clubsByRegionShardFileName,
  type ClubsByRegionClub,
  type ClubsByRegionHealth,
  type ClubsByRegionTier,
  type ClubsByRegionShard,
  type ClubsByRegionPoint,
  type ClubsByRegionWorld,
  type ClubsByRegionWorldPoints,
  type ClubsByRegionTopMetric,
} from './schemas/clubs-by-region.schema.js'

// Worldwide club race artifact — snapshots/{date}/global-club-race.json (#1556)
export {
  GlobalClubRaceSchema,
  GlobalClubRaceFormatSchema,
  GlobalClubRaceScopeSchema,
  GlobalClubRaceTierRuleSchema,
  GlobalClubRaceMembershipBasisSchema,
  GlobalClubRaceRulesetSchema,
  GlobalClubRaceObservationSchema,
  GlobalClubRaceTimelinePointSchema,
  GlobalClubRaceMembershipBandsSchema,
  GlobalClubRaceDistributionSchema,
  GlobalClubRaceLevelSchema,
  GlobalClubRaceCurrentSchema,
  GlobalClubRaceTierStandingSchema,
  GlobalClubRaceReachedSchema,
  GlobalClubRaceDistrictSchema,
  GLOBAL_CLUB_RACE_FORMAT,
  GLOBAL_CLUB_RACE_FILE_NAME,
  type GlobalClubRace,
  type GlobalClubRaceFormat,
  type GlobalClubRaceScope,
  type GlobalClubRaceTierRule,
  type GlobalClubRaceMembershipBasis,
  type GlobalClubRaceRuleset,
  type GlobalClubRaceObservation,
  type GlobalClubRaceTimelinePoint,
  type GlobalClubRaceMembershipBands,
  type GlobalClubRaceDistribution,
  type GlobalClubRaceLevel,
  type GlobalClubRaceCurrent,
  type GlobalClubRaceTierStanding,
  type GlobalClubRaceReached,
  type GlobalClubRaceDistrict,
} from './schemas/global-club-race.schema.js'

// Worldwide program-year series — v1/global-history.json (#1499)
export {
  GlobalHistorySchema,
  GlobalHistoryFormatSchema,
  GlobalHistoryDistrictsSchema,
  GlobalHistoryMembershipSchema,
  GlobalHistoryDistinguishedClubsSchema,
  GlobalHistoryDistinguishedDistrictsSchema,
  GlobalHistoryClubMovementSchema,
  GlobalHistoryEducationSchema,
  GlobalHistoryYearSchema,
  GlobalHistoryOmittedYearSchema,
  GLOBAL_HISTORY_FORMAT,
  GLOBAL_HISTORY_OBJECT_PATH,
  type GlobalHistory,
  type GlobalHistoryFormat,
  type GlobalHistoryDistricts,
  type GlobalHistoryMembership,
  type GlobalHistoryDistinguishedClubs,
  type GlobalHistoryDistinguishedDistricts,
  type GlobalHistoryClubMovement,
  type GlobalHistoryEducation,
  type GlobalHistoryYear,
  type GlobalHistoryOmittedYear,
} from './schemas/global-history.schema.js'

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

// 2026 district reformation (#1442) — the one signal that decides whether a
// year-over-year comparison straddling 2026-07-01 compares the same district
// on both sides. Consumed by analytics-core, collector-cli and the frontend's
// year-over-year hooks; #1443 ("What Changed" reformation context) adopts the
// same helper rather than re-deriving it.
export {
  DISTRICT_REFORMATION_DATE,
  DISTRICT_REFORMATION_PROGRAM_YEAR,
  DISTRICT_REFORMATION_NOTICE,
  REFORMATION_RELATIVE_THRESHOLD,
  REFORMATION_MIN_ABSOLUTE_CHANGE,
  spansDistrictReformation,
  programYearStartDate,
  programYearStartYear,
  detectReformationDiscontinuity,
  type ReformationDiscontinuity,
  type ReformationDiscontinuityInput,
  type ReformationDiscontinuityReason,
} from './reformation/districtReformation.js'

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

// Counted education award (#1592, #1599) — Pathways L1–L5 + DTM. The collector
// counts distinct members per club by it; the frontend counts awards by it.
export { isCountedEducationAward } from './education/countedEducationAward.js'

// Education ledger history — raw-education-ledger/<PY>/district_<id>.json
// (#1802): the archive ledger with Date kept per month, tagged by program.
export {
  educationAwardProgram,
  awardCodeFromAward,
  pathwaysLevel,
  type EducationAwardProgram,
} from './education/educationAwardProgram.js'
export {
  EDUCATION_LEDGER_HISTORY_VERSION,
  EDUCATION_LEDGER_HISTORY_PREFIX,
  EducationAwardProgramSchema,
  EducationLedgerMonthRecordSchema,
  EducationLedgerHistoryFileSchema,
  educationLedgerHistoryObjectPath,
  ledgerRecordsThroughMonth,
  type EducationLedgerMonthRecord,
  type EducationLedgerHistoryFile,
} from './schemas/education-ledger-history.schema.js'

// Education rollup — derived/education-rollup/{<PY>,index}.json (#1801):
// ledger awards per district / region / world per PY; staging-only until #1763.
export {
  EDUCATION_ROLLUP_VERSION,
  EDUCATION_ROLLUP_PREFIX,
  EDUCATION_ROLLUP_INDEX_PATH,
  EducationAwardTotalsSchema,
  PathwaysMatrixSchema,
  EducationAwardsBlockSchema,
  EducationNotAvailableReasonSchema,
  EducationRollupDistrictSchema,
  EducationRollupAggregateSchema,
  EducationRollupSourceSchema,
  EducationRollupProgramYearSchema,
  EducationRollupIndexSchema,
  educationRollupObjectPath,
  type EducationAwardTotals,
  type EducationAwardsBlock,
  type EducationRollupDistrict,
  type EducationRollupAggregate,
  type EducationRollupProgramYear,
  type EducationRollupIndex,
} from './schemas/education-rollup.schema.js'

// Club contact fields never reach a promoted artifact (#2026)
export {
  CLUB_CONTACT_KEYS,
  isClubContactKey,
  omitClubContactFields,
  findClubContactField,
} from './privacy/club-contact.js'

// No link in a club's published meeting place (#2069)
export {
  stripLinks,
  containsLink,
  isShortenedLink,
} from './privacy/meeting-links.js'

// No link or email in a reports file's place text, no place key lost (#2097)
export {
  REPORTS_PLACE_TEXT_FIELDS,
  repairReportsPlaceText,
  scrubReportsPlaceText,
  type ReportsPlaceTextRepair,
} from './privacy/reports-place-text.js'

// District analytics category lists as clubId lists (#1901 option B)
export {
  DISTRICT_ANALYTICS_CLUB_LISTS,
  slimDistrictAnalyticsClubLists,
  expandDistrictAnalyticsClubLists,
  type FullDistrictAnalyticsClubLists,
  type SlimDistrictAnalyticsClubLists,
  type SlimDistrictAnalytics,
} from './types/district-analytics-club-lists.js'
