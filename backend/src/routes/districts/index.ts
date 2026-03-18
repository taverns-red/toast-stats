/**
 * Districts routes index module
 * Composes all district route modules into a single router
 * Requirements: 2.6
 */

import { Router } from 'express'
import { coreRouter } from './core.js'
import { snapshotsRouter } from './snapshots.js'
import { rankingsRouter } from './rankings.js'

const router = Router()

// Mount all route modules
// Order matters: more specific routes should come before parameterized routes

// Snapshots routes (includes /cache/dates which must come before /:districtId)
router.use('/', snapshotsRouter)

// Core routes (includes / and /:districtId routes)
router.use('/', coreRouter)

// Rankings routes (/:districtId/available-ranking-years)
router.use('/', rankingsRouter)

export default router

// Re-export shared utilities for external use if needed
export {
  validateDistrictId,
  getValidDistrictId,
  validateDateFormat,
  perDistrictSnapshotStore,
  districtDataAggregator,
  snapshotStore,
  getRefreshService,
  getTimeSeriesIndexService,
} from './shared.js'
