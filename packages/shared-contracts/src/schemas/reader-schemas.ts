/**
 * Reader variants of the published-artifact contracts (#2493, ADR 0019
 * step 0 in `taverns-red/ops`).
 *
 * The frontend (`frontend/src/services/cdn*.ts`) and the mcp-server read
 * these files from the CDN. A reader must keep working when a newer
 * pipeline adds a field, so the previous release (or a rolled-back one)
 * still renders current data. These are the schemas a reader parses with.
 *
 * @module reader-schemas
 */

import {
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
} from './clubs-by-region.schema.js'
import { DistrictReportsDatasetSchema } from './district-reports.schema.js'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
} from './education-rollup.schema.js'
import { GlobalClubRaceSchema } from './global-club-race.schema.js'
import { PerDistrictDataSchema } from './per-district-data.schema.js'
import { RegionMembershipSeriesSchema } from './region-membership-series.schema.js'
import { RegionRollupsSchema } from './region-rollups.schema.js'
import { ReportsRollupsSchema } from './reports-rollups.schema.js'
import { SuspendedClubsSchema } from './suspended-clubs.schema.js'

export const DistrictReportsDatasetReaderSchema = DistrictReportsDatasetSchema
export const SuspendedClubsReaderSchema = SuspendedClubsSchema
export const GlobalClubRaceReaderSchema = GlobalClubRaceSchema
export const RegionRollupsReaderSchema = RegionRollupsSchema
export const ClubsByRegionShardReaderSchema = ClubsByRegionShardSchema
export const ClubsByRegionWorldReaderSchema = ClubsByRegionWorldSchema
export const RegionMembershipSeriesReaderSchema = RegionMembershipSeriesSchema
export const EducationRollupProgramYearReaderSchema =
  EducationRollupProgramYearSchema
export const EducationRollupIndexReaderSchema = EducationRollupIndexSchema
export const ReportsRollupsReaderSchema = ReportsRollupsSchema
export const PerDistrictDataReaderSchema = PerDistrictDataSchema
