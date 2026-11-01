/**
 * Node-only entry — `@taverns-red/analytics-core/node` (#2447).
 *
 * Everything here touches the filesystem, so it must never be reachable from
 * the main entry (`src/index.ts`), which the browser bundle imports. Callers
 * that run under Node (collector-cli, repo scripts) import the readers from
 * here and the pure builders from the main entry.
 */

export {
  readSnapshotRankings,
  readSnapshotRollupInput,
  readRegionRollupInput,
  readClubsByRegionInput,
  readMeetingTimesInput,
} from './rollup/snapshotReaders.js'
