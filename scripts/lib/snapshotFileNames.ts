/**
 * Canonical district-snapshot file naming — scripts-side re-export (#1428).
 *
 * The implementation lives in `@taverns-red/shared-contracts`
 * (`src/naming/snapshotFileNames.ts`) because `packages/collector-cli`
 * needs the SAME matcher — `AnalyticsComputeService.discoverAvailableDistricts`
 * carried its own copy and fabricated a `61_reports` district from the
 * daily-reports sidecar. Two regexes that must agree is the drift this issue
 * exists to remove, so there is exactly one, and this module only points at it.
 */

export {
  DISTRICT_SNAPSHOT_FILE_PATTERN,
  DISTRICT_SNAPSHOT_OBJECT_PATTERN,
  isDistrictSnapshotFile,
  districtIdFromSnapshotFileName,
  parseDistrictSnapshotObjectName,
  indexDistrictSnapshotObjects,
  type DistrictSnapshotObject,
  type DistrictSnapshotDateIndex,
} from '@taverns-red/shared-contracts'
