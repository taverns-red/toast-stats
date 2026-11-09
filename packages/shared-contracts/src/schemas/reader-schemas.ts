/**
 * Reader variants of the published-artifact contracts (#2493, ADR 0019
 * step 0 in `taverns-red/ops`).
 *
 * The frontend (`frontend/src/services/cdn*.ts`) and the mcp-server read
 * these files from the CDN. A reader must keep working when a newer
 * pipeline adds a field, so the previous release (or a rolled-back one)
 * still renders current data. These are the schemas a reader parses with:
 * the same contract as the writer's, but every object strips an unknown key
 * instead of rejecting it.
 *
 * The base schemas stay strict on purpose. The collector and the publish
 * gates (`scripts/lib/promotionContentGate.ts`, `stripClubContact.ts`,
 * `snapshotPublishGate.ts`) validate with them, and there an extra key is a
 * privacy leak (a sponsor's name, a member field, a club email) or a typo,
 * and must fail before anything is published.
 *
 * Only the schemas that are strict somewhere need a reader variant; the
 * guard tests in the frontend and mcp-server fail if a reader parses with a
 * schema that still rejects unknown keys.
 *
 * @module reader-schemas
 */

import { toTolerantReader } from '../validation/tolerantReader.js'
import {
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
} from './clubs-by-region.schema.js'
import { DistrictReportsDatasetSchema } from './district-reports.schema.js'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
} from './education-rollup.schema.js'
import { EducationTimelineEntitySchema } from './education-timeline.schema.js'
import { GlobalClubRaceSchema } from './global-club-race.schema.js'
import { PerDistrictDataSchema } from './per-district-data.schema.js'
import { RegionMembershipSeriesSchema } from './region-membership-series.schema.js'
import { RegionRollupsSchema } from './region-rollups.schema.js'
import { ReportsRollupsSchema } from './reports-rollups.schema.js'
import { SuspendedClubsSchema } from './suspended-clubs.schema.js'

export const DistrictReportsDatasetReaderSchema = toTolerantReader(
  DistrictReportsDatasetSchema
)
export const SuspendedClubsReaderSchema = toTolerantReader(SuspendedClubsSchema)
export const GlobalClubRaceReaderSchema = toTolerantReader(GlobalClubRaceSchema)
export const RegionRollupsReaderSchema = toTolerantReader(RegionRollupsSchema)
export const ClubsByRegionShardReaderSchema = toTolerantReader(
  ClubsByRegionShardSchema
)
export const ClubsByRegionWorldReaderSchema = toTolerantReader(
  ClubsByRegionWorldSchema
)
export const RegionMembershipSeriesReaderSchema = toTolerantReader(
  RegionMembershipSeriesSchema
)
export const EducationRollupProgramYearReaderSchema = toTolerantReader(
  EducationRollupProgramYearSchema
)
export const EducationRollupIndexReaderSchema = toTolerantReader(
  EducationRollupIndexSchema
)
export const EducationTimelineEntityReaderSchema = toTolerantReader(
  EducationTimelineEntitySchema
)
export const ReportsRollupsReaderSchema = toTolerantReader(ReportsRollupsSchema)
export const PerDistrictDataReaderSchema = toTolerantReader(
  PerDistrictDataSchema
)
