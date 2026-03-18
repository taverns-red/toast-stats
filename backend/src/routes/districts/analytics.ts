/**
 * Analytics routes module
 * Handles analytics, trends, division/area comparison, and year-over-year endpoints
 * Requirements: 2.2, 4.1, 4.2, 4.5, 4.6, 10.4
 */

import * as path from 'path'
import { Router, type Request, type Response } from 'express'
import { cacheMiddleware } from '../../middleware/cache.js'
import { generateDistrictCacheKey } from '../../utils/cacheKeys.js'
import { logger } from '../../utils/logger.js'
import { transformErrorResponse } from '../../utils/transformers.js'
import type { DistrictAnalytics as AnalyticsCoreDistrictAnalytics } from '@toastmasters/analytics-core'
import {
  validateDistrictId,
  getValidDistrictId,
  validateDateFormat,
  extractStringParam,
  snapshotStore,
  cacheDirectory,
  getSnapshotForDate,
  getTimeSeriesIndexService,
  analyticsFileReader,
} from './shared.js'
import {
  PreComputedAnalyticsReader,
  SchemaVersionError,
  CorruptedFileError,
} from '../../services/PreComputedAnalyticsReader.js'
import { ANALYTICS_SCHEMA_VERSION } from '@toastmasters/analytics-core'
import {
  isLegacyDistinguishedClubsFormat,
  transformLegacyDistinguishedClubs,
} from '../../utils/legacyTransformation.js'
import { transformPerformanceTargets } from '../../utils/performanceTargetsTransformation.js'

export const analyticsRouter = Router()

// ──── CDN deprecation notice ────
// These endpoints are being superseded by Cloud CDN at cdn.taverns.red.
// They remain active as fallback but will be sunset in a future release.
analyticsRouter.use((_req, res, next) => {
  res.set('Deprecation', 'true')
  res.set('Sunset', '2026-07-01')
  res.set('Link', '<https://cdn.taverns.red>; rel="successor-version"')
  next()
})

// Create PreComputedAnalyticsReader instance for serving pre-computed analytics
// Requirement 4.1: THE Backend SHALL read pre-computed analytics from the file system
const preComputedAnalyticsReader = new PreComputedAnalyticsReader({
  cacheDir: cacheDirectory,
  readFile: analyticsFileReader,
})

/**
 * GET /api/districts/:districtId/membership-analytics
 * Serve pre-computed membership analytics for a district
 * Query params: startDate (optional), endDate (optional)
 *
 * Requirements:
 * - 1.4: Read from pre-computed file
 * - 1.5: Return 404 with helpful message if file missing
 * - 8.1: Route SHALL read from pre-computed files only
 */
analyticsRouter.get(
  '/:districtId/membership-analytics',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'membership-analytics', {
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      })
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const districtId = getValidDistrictId(req)

      // Validate district ID
      if (!districtId) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Use date-aware snapshot selection to respect endDate query parameter
      // Requirements: 2.1, 2.2, 2.3 (Analytics Date Selection Fix)
      const endDate =
        typeof req.query['endDate'] === 'string'
          ? req.query['endDate']
          : undefined
      const {
        snapshot,
        snapshotDate,
        error: snapshotError,
      } = await getSnapshotForDate(endDate)

      // Handle error when requested snapshot doesn't exist (Requirement 2.3)
      if (snapshotError) {
        res.status(404).json({ error: snapshotError })
        return
      }

      if (!snapshot || !snapshotDate) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      logger.info('Reading pre-computed membership analytics', {
        operation: 'getMembershipAnalytics',
        districtId,
        snapshotDate,
      })

      // Requirement 1.4: Read from pre-computed file
      const analytics =
        await preComputedAnalyticsReader.readMembershipAnalytics(
          snapshotDate,
          districtId
        )

      // Requirement 1.5: Return 404 with helpful message if file missing
      if (!analytics) {
        logger.info('Pre-computed membership analytics not found', {
          operation: 'getMembershipAnalytics',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed membership analytics not found',
            details:
              'Run collector-cli compute-analytics to generate analytics',
          },
        })
        return
      }

      logger.info('Successfully served pre-computed membership analytics', {
        operation: 'getMembershipAnalytics',
        districtId,
        snapshotDate,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(analytics)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in membership analytics', {
          operation: 'getMembershipAnalytics',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details: `Re-run collector-cli compute-analytics to regenerate analytics files.`,
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted membership analytics file', {
          operation: 'getMembershipAnalytics',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to read membership analytics'

      logger.error('Failed to serve membership analytics', {
        operation: 'getMembershipAnalytics',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/analytics
 * Serve pre-computed district analytics from the file system
 * Query params: startDate (optional), endDate (optional)
 * Requirements: 4.1, 4.2, 4.5, 4.6 (Pre-Computed Analytics Pipeline)
 *
 * This endpoint serves pre-computed analytics files generated by the collector-cli.
 * The backend does NOT compute analytics on-demand to avoid memory issues in Cloud Run.
 */
analyticsRouter.get(
  '/:districtId/analytics',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache for analytics
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'analytics', {
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      })
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const districtId = getValidDistrictId(req)
      const { startDate, endDate } = req.query

      // Validate district ID
      if (!districtId) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Validate date formats if provided
      if (
        startDate &&
        typeof startDate === 'string' &&
        !validateDateFormat(startDate!)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_DATE_FORMAT',
            message: 'startDate must be in YYYY-MM-DD format',
          },
        })
        return
      }

      if (
        endDate &&
        typeof endDate === 'string' &&
        !validateDateFormat(endDate!)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_DATE_FORMAT',
            message: 'endDate must be in YYYY-MM-DD format',
          },
        })
        return
      }

      // Validate date range
      if (
        startDate &&
        endDate &&
        typeof startDate === 'string' &&
        typeof endDate === 'string'
      ) {
        const start = new Date(startDate)
        const end = new Date(endDate)

        if (start > end) {
          res.status(400).json({
            error: {
              code: 'INVALID_DATE_RANGE',
              message: 'startDate must be before or equal to endDate',
            },
          })
          return
        }
      }

      // Requirement 4.1: Read pre-computed analytics from the file system
      // Use date-aware snapshot selection to respect endDate query parameter
      // Requirements: 1.1, 1.2, 1.3, 1.4 (Analytics Date Selection Fix)
      const endDateParam = typeof endDate === 'string' ? endDate : undefined
      const {
        snapshot,
        snapshotDate,
        error: snapshotError,
      } = await getSnapshotForDate(endDateParam)

      // Handle error when requested snapshot doesn't exist (Requirement 1.3)
      if (snapshotError) {
        res.status(404).json({ error: snapshotError })
        return
      }

      if (!snapshot || !snapshotDate) {
        // No snapshots available at all
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No cached data available for analytics',
            details: 'Run collector-cli to collect historical data',
          },
        })
        return
      }

      logger.info('Reading pre-computed analytics', {
        operation: 'getDistrictAnalytics',
        districtId,
        snapshotDate,
      })

      // Read pre-computed analytics from file system
      // Requirement 4.1: THE Backend SHALL read pre-computed analytics from the file system
      const analytics = await preComputedAnalyticsReader.readDistrictAnalytics(
        snapshotDate,
        districtId
      )

      // Requirement 4.2: IF pre-computed analytics are not available, return 404
      if (analytics === null) {
        logger.info('Pre-computed analytics not found', {
          operation: 'getDistrictAnalytics',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: `Analytics not available for district ${districtId} on ${snapshotDate}`,
            details:
              'Pre-computed analytics have not been generated for this district. Run the compute-analytics command in collector-cli.',
          },
        })
        return
      }

      // Read performance targets for per-metric rankings (world rank, percentile, region rank)
      // Per-metric-rankings spec: Include rankings in analytics response
      const performanceTargets =
        await preComputedAnalyticsReader.readPerformanceTargets(
          snapshotDate,
          districtId
        )

      // Read payments trend from time-series index (pre-computed by collector-cli)
      // Requirements 1.1, 1.2, 1.3, 1.4: Use time-series index instead of single snapshot
      let paymentsTrend: Array<{ date: string; payments: number }> | undefined
      if (typeof startDate === 'string' && typeof endDate === 'string') {
        try {
          const timeSeriesIndexService = await getTimeSeriesIndexService()
          const timeSeriesData = await timeSeriesIndexService.getTrendData(
            districtId,
            startDate,
            endDate
          )
          if (timeSeriesData.length > 0) {
            paymentsTrend = timeSeriesData.map(dp => ({
              date: dp.date,
              payments: dp.payments,
            }))
          }
        } catch (trendError) {
          logger.debug('Could not read payments trend from time-series index', {
            operation: 'getDistrictAnalytics',
            districtId,
            error:
              trendError instanceof Error
                ? trendError.message
                : 'Unknown error',
          })
        }
      }

      // Requirement 4.1: Transform legacy distinguishedClubs array format to counts object
      // Note: Legacy pre-computed files may have distinguishedClubs as an array instead of counts object.
      // The type guard checks the runtime data format, not the TypeScript type.
      if (isLegacyDistinguishedClubsFormat(analytics.distinguishedClubs)) {
        // Requirement 4.3: Log warning when transforming legacy data
        logger.warn('Transforming legacy distinguishedClubs format', {
          operation: 'getDistrictAnalytics',
          districtId,
          snapshotDate,
        })

        // Transform the legacy array to counts object
        // Type assertion needed because runtime data doesn't match declared type for legacy files
        const legacyData = analytics.distinguishedClubs

        // Use type assertion to mutate the object - the runtime data is in legacy format
        // but we need to transform it to the new format before serving
        const mutableAnalytics = analytics as unknown as Record<string, unknown>
        mutableAnalytics['distinguishedClubs'] =
          transformLegacyDistinguishedClubs(legacyData)
        // Preserve the list in the new field
        mutableAnalytics['distinguishedClubsList'] = legacyData
      }

      // Requirement 10.4: Log when serving pre-computed analytics, including file path and schema version
      const analyticsFilePath = path.join(
        cacheDirectory,
        'snapshots',
        snapshotDate,
        'analytics',
        `district_${districtId}_analytics.json`
      )
      logger.info('Successfully served pre-computed analytics', {
        operation: 'getDistrictAnalytics',
        districtId,
        snapshotDate,
        filePath: analyticsFilePath,
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        hasPerformanceTargets: performanceTargets !== null,
        hasPaymentsTrend:
          paymentsTrend !== undefined && paymentsTrend.length > 0,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      // Include performanceTargets and paymentsTrend in response if available
      // Per-metric-rankings spec: Frontend expects performanceTargets with rankings
      // Transform from analytics-core format to frontend-expected format
      const response = {
        ...analytics,
        ...(performanceTargets && {
          performanceTargets: transformPerformanceTargets(performanceTargets),
        }),
        ...(paymentsTrend && { paymentsTrend }),
      }

      res.json(response)
    } catch (error) {
      // Requirement 4.5: IF the schema version is incompatible, return 500
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in pre-computed analytics', {
          operation: 'getDistrictAnalytics',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details: `The pre-computed analytics file has schema version ${error.fileVersion} which is incompatible with the current backend version. Re-run compute-analytics to regenerate.`,
          },
        })
        return
      }

      // Requirement 4.6: IF the analytics file is corrupted, return 500
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted pre-computed analytics file', {
          operation: 'getDistrictAnalytics',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'The pre-computed analytics file is corrupted or contains invalid JSON. Re-run compute-analytics to regenerate.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to read district analytics'

      logger.error('Failed to serve pre-computed analytics', {
        operation: 'getDistrictAnalytics',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: 'Failed to read analytics',
          details:
            errorResponse.details ||
            'An unexpected error occurred while reading analytics. Please try again or contact support if the issue persists.',
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/clubs/:clubId/trends
 * Serve pre-computed club-specific trend data
 *
 * Requirements:
 * - 2.4: Read from pre-computed data
 * - 2.5: Return 404 with helpful message if file missing
 * - 8.2: Route SHALL read from pre-computed files only
 */
analyticsRouter.get(
  '/:districtId/clubs/:clubId/trends',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      const clubId = extractStringParam(req.params['clubId'], 'clubId')
      return generateDistrictCacheKey(districtId, `clubs/${clubId}/trends`)
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const districtId = getValidDistrictId(req)
      const rawClubId = req.params['clubId']
      const clubId = Array.isArray(rawClubId) ? rawClubId[0] : rawClubId

      // Validate district ID
      if (!districtId) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Validate club ID
      if (!clubId || clubId.trim() === '') {
        res.status(400).json({
          error: {
            code: 'INVALID_CLUB_ID',
            message: 'Club ID is required',
          },
        })
        return
      }

      // Get the latest successful snapshot to determine the snapshot date
      const latestSnapshot = await snapshotStore.getLatestSuccessful()

      if (!latestSnapshot) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      const snapshotDate = latestSnapshot.snapshot_id

      logger.info('Reading pre-computed club trends', {
        operation: 'getClubTrends',
        districtId,
        clubId,
        snapshotDate,
      })

      // Requirement 2.4: Read from pre-computed data
      const clubTrend = await preComputedAnalyticsReader.readClubTrends(
        snapshotDate,
        districtId,
        clubId
      )

      // Requirement 2.5: Return 404 with helpful message if file missing
      if (!clubTrend) {
        logger.info('Club trends not found', {
          operation: 'getClubTrends',
          districtId,
          clubId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'CLUB_NOT_FOUND',
            message: 'Club not found in district analytics',
            details:
              'The club may not exist or pre-computed analytics have not been generated. Run collector-cli compute-analytics.',
          },
        })
        return
      }

      logger.info('Successfully served pre-computed club trends', {
        operation: 'getClubTrends',
        districtId,
        clubId,
        snapshotDate,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(clubTrend)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in club trends', {
          operation: 'getClubTrends',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted club trends file', {
          operation: 'getClubTrends',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get club trends'

      logger.error('Failed to serve club trends', {
        operation: 'getClubTrends',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/vulnerable-clubs
 * Serve pre-computed list of vulnerable clubs for a district
 *
 * Requirements:
 * - 3.4: Read from pre-computed file
 * - 3.5: Return 404 with helpful message if file missing
 * - 8.3: Route SHALL read from pre-computed files only
 *
 * Note: Renamed from at-risk-clubs to vulnerable-clubs to align with
 * internal terminology shift documented in the codebase.
 */
analyticsRouter.get(
  '/:districtId/vulnerable-clubs',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'vulnerable-clubs')
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const districtId = getValidDistrictId(req)

      // Validate district ID
      if (!districtId) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Use date-aware snapshot selection to respect endDate query parameter
      // Requirements: 5.1, 5.2, 5.3 (Analytics Date Selection Fix)
      const endDate =
        typeof req.query['endDate'] === 'string'
          ? req.query['endDate']
          : undefined
      const {
        snapshot,
        snapshotDate,
        error: snapshotError,
      } = await getSnapshotForDate(endDate)

      // Handle error when requested snapshot doesn't exist (Requirement 5.3)
      if (snapshotError) {
        res.status(404).json({ error: snapshotError })
        return
      }

      if (!snapshot || !snapshotDate) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      logger.info('Reading pre-computed vulnerable clubs', {
        operation: 'getVulnerableClubs',
        districtId,
        snapshotDate,
      })

      // Requirement 3.4: Read from pre-computed file
      const vulnerableClubsData =
        await preComputedAnalyticsReader.readVulnerableClubs(
          snapshotDate,
          districtId
        )

      // Requirement 3.5: Return 404 with helpful message if file missing
      if (!vulnerableClubsData) {
        logger.info('Pre-computed vulnerable clubs not found', {
          operation: 'getVulnerableClubs',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed vulnerable clubs data not found',
            details:
              'Run collector-cli compute-analytics to generate analytics',
          },
        })
        return
      }

      logger.info('Successfully served pre-computed vulnerable clubs', {
        operation: 'getVulnerableClubs',
        districtId,
        snapshotDate,
        totalVulnerable: vulnerableClubsData.totalVulnerableClubs,
        interventionRequired: vulnerableClubsData.interventionRequiredClubs,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      // Response uses new terminology aligned with frontend expectations
      res.json({
        districtId: vulnerableClubsData.districtId,
        totalVulnerableClubs: vulnerableClubsData.totalVulnerableClubs,
        interventionRequiredClubs:
          vulnerableClubsData.interventionRequiredClubs,
        vulnerableClubs: vulnerableClubsData.vulnerableClubs.length,
        clubs: [
          ...vulnerableClubsData.vulnerableClubs,
          ...vulnerableClubsData.interventionRequired,
        ],
      })
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in vulnerable clubs', {
          operation: 'getVulnerableClubs',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted vulnerable clubs file', {
          operation: 'getVulnerableClubs',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to identify vulnerable clubs'

      logger.error('Failed to serve vulnerable clubs', {
        operation: 'getVulnerableClubs',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/leadership-insights
 * Serve pre-computed leadership effectiveness analytics
 * Query params: startDate (optional), endDate (optional)
 *
 * Requirements:
 * - 4.3: Read from pre-computed file
 * - 4.4: Return 404 with helpful message if file missing
 * - 8.4: Route SHALL read from pre-computed files only
 */
analyticsRouter.get(
  '/:districtId/leadership-insights',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'leadership-insights', {
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      })
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const { districtId } = req.params

      // Validate district ID - ensure it's a string first
      if (
        !districtId ||
        typeof districtId !== 'string' ||
        !validateDistrictId(districtId)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Use date-aware snapshot selection to respect endDate query parameter
      // Requirements: 3.1, 3.2, 3.3 (Analytics Date Selection Fix)
      const endDate =
        typeof req.query['endDate'] === 'string'
          ? req.query['endDate']
          : undefined
      const {
        snapshot,
        snapshotDate,
        error: snapshotError,
      } = await getSnapshotForDate(endDate)

      // Handle error when requested snapshot doesn't exist (Requirement 3.3)
      if (snapshotError) {
        res.status(404).json({ error: snapshotError })
        return
      }

      if (!snapshot || !snapshotDate) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      logger.info('Reading pre-computed leadership insights', {
        operation: 'getLeadershipInsights',
        districtId,
        snapshotDate,
      })

      // Requirement 4.3: Read from pre-computed file
      const insights = await preComputedAnalyticsReader.readLeadershipInsights(
        snapshotDate,
        districtId
      )

      // Requirement 4.4: Return 404 with helpful message if file missing
      if (!insights) {
        logger.info('Pre-computed leadership insights not found', {
          operation: 'getLeadershipInsights',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed leadership insights not found',
            details:
              'Run collector-cli compute-analytics to generate analytics',
          },
        })
        return
      }

      logger.info('Successfully served pre-computed leadership insights', {
        operation: 'getLeadershipInsights',
        districtId,
        snapshotDate,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(insights)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in leadership insights', {
          operation: 'getLeadershipInsights',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted leadership insights file', {
          operation: 'getLeadershipInsights',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to read leadership insights'

      logger.error('Failed to serve leadership insights', {
        operation: 'getLeadershipInsights',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/distinguished-club-analytics
 * Serve pre-computed distinguished club analytics
 * Query params: startDate (optional), endDate (optional)
 *
 * Requirements:
 * - 5.3: Read from pre-computed file
 * - 5.4: Return 404 with helpful message if file missing
 * - 8.5: Route SHALL read from pre-computed files only
 */
analyticsRouter.get(
  '/:districtId/distinguished-club-analytics',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(
        districtId,
        'distinguished-club-analytics',
        {
          startDate: req.query['startDate'],
          endDate: req.query['endDate'],
        }
      )
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const { districtId } = req.params

      // Validate district ID - ensure it's a string first
      if (
        !districtId ||
        typeof districtId !== 'string' ||
        !validateDistrictId(districtId)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Use date-aware snapshot selection to respect endDate query parameter
      // Requirements: 4.1, 4.2, 4.3 (Analytics Date Selection Fix)
      const endDate =
        typeof req.query['endDate'] === 'string'
          ? req.query['endDate']
          : undefined
      const {
        snapshot,
        snapshotDate,
        error: snapshotError,
      } = await getSnapshotForDate(endDate)

      // Handle error when requested snapshot doesn't exist (Requirement 4.3)
      if (snapshotError) {
        res.status(404).json({ error: snapshotError })
        return
      }

      if (!snapshot || !snapshotDate) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      logger.info('Reading pre-computed distinguished club analytics', {
        operation: 'getDistinguishedClubAnalytics',
        districtId,
        snapshotDate,
      })

      // Requirement 5.3: Read from pre-computed file
      const analytics =
        await preComputedAnalyticsReader.readDistinguishedClubAnalytics(
          snapshotDate,
          districtId
        )

      // Requirement 5.4: Return 404 with helpful message if file missing
      if (!analytics) {
        logger.info('Pre-computed distinguished club analytics not found', {
          operation: 'getDistinguishedClubAnalytics',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed distinguished club analytics not found',
            details:
              'Run collector-cli compute-analytics to generate analytics',
          },
        })
        return
      }

      logger.info(
        'Successfully served pre-computed distinguished club analytics',
        {
          operation: 'getDistinguishedClubAnalytics',
          districtId,
          snapshotDate,
        }
      )

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(analytics)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error(
          'Schema version mismatch in distinguished club analytics',
          {
            operation: 'getDistinguishedClubAnalytics',
            fileVersion: error.fileVersion,
            filePath: error.filePath,
          }
        )

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted distinguished club analytics file', {
          operation: 'getDistinguishedClubAnalytics',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to read distinguished club analytics'

      logger.error('Failed to serve distinguished club analytics', {
        operation: 'getDistinguishedClubAnalytics',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/year-over-year/:date
 * Serve pre-computed year-over-year comparison for a specific date
 *
 * Requirements:
 * - 6.4: Read from pre-computed file
 * - 6.5: Return 404 with helpful message if file missing
 * - 8.6: Route SHALL read from pre-computed files only
 */
analyticsRouter.get(
  '/:districtId/year-over-year/:date',
  cacheMiddleware({
    ttl: 300, // 5 minutes cache
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      const date = extractStringParam(req.params['date'], 'date')
      return generateDistrictCacheKey(districtId, `year-over-year/${date}`)
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const districtId = getValidDistrictId(req)
      const rawDate = req.params['date']
      const date = Array.isArray(rawDate) ? rawDate[0] : rawDate

      // Validate district ID
      if (!districtId) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Validate date format
      if (!date || !validateDateFormat(date)) {
        res.status(400).json({
          error: {
            code: 'INVALID_DATE_FORMAT',
            message: 'Date must be in YYYY-MM-DD format',
          },
        })
        return
      }

      // Get the latest successful snapshot to determine the snapshot date
      const latestSnapshot = await snapshotStore.getLatestSuccessful()

      if (!latestSnapshot) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      const snapshotDate = latestSnapshot.snapshot_id

      logger.info('Reading pre-computed year-over-year data', {
        operation: 'getYearOverYear',
        districtId,
        requestedDate: date,
        snapshotDate,
      })

      // Requirement 6.4: Read from pre-computed file
      const comparison = await preComputedAnalyticsReader.readYearOverYear(
        snapshotDate,
        districtId
      )

      // Requirement 6.5: Return 404 with helpful message if file missing
      if (!comparison) {
        logger.info('Pre-computed year-over-year data not found', {
          operation: 'getYearOverYear',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed year-over-year data not found',
            details:
              'Run collector-cli compute-analytics to generate analytics. Year-over-year comparison requires historical data from the previous program year.',
          },
        })
        return
      }

      logger.info('Successfully served pre-computed year-over-year data', {
        operation: 'getYearOverYear',
        districtId,
        snapshotDate,
        dataAvailable: comparison.dataAvailable,
      })

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(comparison)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in year-over-year data', {
          operation: 'getYearOverYear',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted year-over-year file', {
          operation: 'getYearOverYear',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to read year-over-year comparison'

      logger.error('Failed to serve year-over-year data', {
        operation: 'getYearOverYear',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * GET /api/districts/:districtId/export
 * Export district data to CSV format from pre-computed analytics
 * Query params: format (csv), startDate (optional), endDate (optional)
 *
 * Requirements:
 * - 8.7: Route SHALL read from pre-computed files only
 * - 11.1: Read from pre-computed analytics files
 * - 11.2: Transform pre-computed JSON data to CSV format
 * - 11.4: Return 404 if pre-computed data is missing
 */
analyticsRouter.get(
  '/:districtId/export',
  async (req: Request, res: Response) => {
    try {
      const { districtId } = req.params
      const { format } = req.query

      // Validate district ID - ensure it's a string first
      if (
        !districtId ||
        typeof districtId !== 'string' ||
        !validateDistrictId(districtId)
      ) {
        res.status(400).json({
          error: {
            code: 'INVALID_DISTRICT_ID',
            message: 'Invalid district ID format',
          },
        })
        return
      }

      // Validate format parameter
      if (!format || format !== 'csv') {
        res.status(400).json({
          error: {
            code: 'INVALID_FORMAT',
            message: 'Only CSV format is currently supported. Use format=csv',
          },
        })
        return
      }

      // Get the latest successful snapshot to determine the snapshot date
      const latestSnapshot = await snapshotStore.getLatestSuccessful()

      if (!latestSnapshot) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No snapshot data available',
            details: 'Run collector-cli to fetch data',
          },
        })
        return
      }

      const snapshotDate = latestSnapshot.snapshot_id

      logger.info('Reading pre-computed analytics for export', {
        operation: 'exportDistrictAnalytics',
        districtId,
        snapshotDate,
      })

      // Requirement 11.1: Read from pre-computed analytics files
      const analytics = await preComputedAnalyticsReader.readDistrictAnalytics(
        snapshotDate,
        districtId
      )

      // Requirement 11.4: Return 404 if pre-computed data is missing
      if (!analytics) {
        logger.info('Pre-computed analytics not found for export', {
          operation: 'exportDistrictAnalytics',
          districtId,
          snapshotDate,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_FOUND',
            message: 'Pre-computed analytics not found',
            details:
              'Run collector-cli compute-analytics to generate analytics',
          },
        })
        return
      }

      // Requirement 11.2: Transform pre-computed JSON data to CSV format
      const csvContent = generateDistrictAnalyticsCSV(analytics, districtId)

      // Generate filename with date range
      const dateRangeStr = `_${analytics.dateRange.start}_to_${analytics.dateRange.end}`
      const filename = `district_${districtId}_analytics${dateRangeStr}.csv`

      logger.info('Successfully generated CSV export from pre-computed data', {
        operation: 'exportDistrictAnalytics',
        districtId,
        snapshotDate,
      })

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv;charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Cache-Control', 'no-cache')

      // Stream the CSV content
      res.send(csvContent)
    } catch (error) {
      // Handle schema version errors
      if (error instanceof SchemaVersionError) {
        logger.error('Schema version mismatch in analytics export', {
          operation: 'exportDistrictAnalytics',
          fileVersion: error.fileVersion,
          filePath: error.filePath,
        })

        res.status(500).json({
          error: {
            code: 'SCHEMA_VERSION_MISMATCH',
            message: 'Incompatible analytics schema version',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      // Handle corrupted file errors
      if (error instanceof CorruptedFileError) {
        logger.error('Corrupted analytics file for export', {
          operation: 'exportDistrictAnalytics',
          filePath: error.filePath,
          cause: error.cause.message,
        })

        res.status(500).json({
          error: {
            code: 'CORRUPTED_FILE',
            message: 'Corrupted analytics file',
            details:
              'Re-run collector-cli compute-analytics to regenerate analytics files.',
          },
        })
        return
      }

      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to export district data'

      logger.error('Failed to export district analytics', {
        operation: 'exportDistrictAnalytics',
        error: errorMessage,
      })

      res.status(500).json({
        error: {
          code: errorResponse.code || 'EXPORT_ERROR',
          message: errorMessage,
          details: errorResponse.details,
        },
      })
    }
  }
)

/**
 * Helper function to generate CSV content from district analytics
 * Uses the analytics-core DistrictAnalytics type for pre-computed data
 */
function generateDistrictAnalyticsCSV(
  analytics: AnalyticsCoreDistrictAnalytics,
  districtId: string
): string {
  const lines: string[] = []

  // Helper to escape CSV values
  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // Header section
  lines.push(`District Analytics Export`)
  lines.push(`District ID,${escapeCSV(districtId)}`)
  lines.push(
    `Date Range,${escapeCSV(analytics.dateRange.start)} to ${escapeCSV(analytics.dateRange.end)}`
  )
  lines.push(`Export Date,${new Date().toISOString()}`)
  lines.push('')

  // Summary statistics
  lines.push('Summary Statistics')
  lines.push('Metric,Value')
  lines.push(`Total Membership,${analytics.totalMembership}`)
  lines.push(`Membership Change,${analytics.membershipChange}`)
  lines.push(`Thriving Clubs,${analytics.thrivingClubs.length}`)
  lines.push(`Vulnerable Clubs,${analytics.vulnerableClubs.length}`)
  lines.push(
    `Intervention Required Clubs,${analytics.interventionRequiredClubs.length}`
  )
  lines.push(
    `Distinguished Clubs (Total),${analytics.distinguishedClubs.total}`
  )
  lines.push(
    `Distinguished Clubs (President's),${analytics.distinguishedClubs.presidents}`
  )
  lines.push(
    `Distinguished Clubs (Select),${analytics.distinguishedClubs.select}`
  )
  lines.push(
    `Distinguished Clubs (Distinguished),${analytics.distinguishedClubs.distinguished}`
  )
  // Handle distinguishedProjection - use the single projected value
  const projectionValue =
    analytics.distinguishedProjection.projectedDistinguished
  lines.push(`Distinguished Projection,${projectionValue}`)
  lines.push('')

  // Membership trend
  lines.push('Membership Trend')
  lines.push('Date,Member Count')
  analytics.membershipTrend.forEach(
    (point: { date: string; count: number }) => {
      lines.push(`${escapeCSV(point.date)},${point.count}`)
    }
  )
  lines.push('')

  // Vulnerable clubs
  if (analytics.vulnerableClubs && analytics.vulnerableClubs.length > 0) {
    lines.push('Vulnerable Clubs')
    lines.push(
      'Club ID,Club Name,Status,Current Membership,Current DCP Goals,Risk Factors'
    )
    analytics.vulnerableClubs.forEach(club => {
      const currentMembership =
        club.membershipTrend[club.membershipTrend.length - 1]?.count || 0
      const currentDcpGoals =
        club.dcpGoalsTrend[club.dcpGoalsTrend.length - 1]?.goalsAchieved || 0
      const riskFactors = club.riskFactors.join('; ')
      lines.push(
        `${escapeCSV(club.clubId)},${escapeCSV(club.clubName)},${escapeCSV(club.currentStatus)},${currentMembership},${currentDcpGoals},${escapeCSV(riskFactors)}`
      )
    })
    lines.push('')
  }

  // All clubs performance
  if (analytics.allClubs && analytics.allClubs.length > 0) {
    lines.push('All Clubs Performance')
    lines.push(
      'Club ID,Club Name,Division,Area,Current Membership,Current DCP Goals,Status,Distinguished Level'
    )
    analytics.allClubs.forEach(club => {
      const currentMembership =
        club.membershipTrend[club.membershipTrend.length - 1]?.count || 0
      const currentDcpGoals =
        club.dcpGoalsTrend[club.dcpGoalsTrend.length - 1]?.goalsAchieved || 0
      lines.push(
        `${escapeCSV(club.clubId)},${escapeCSV(club.clubName)},${escapeCSV(club.divisionName)},${escapeCSV(club.areaName)},${currentMembership},${currentDcpGoals},${escapeCSV(club.currentStatus)},${escapeCSV(club.distinguishedLevel || 'None')}`
      )
    })
    lines.push('')
  }

  // Division rankings (using analytics-core DivisionRanking type)
  if (analytics.divisionRankings && analytics.divisionRankings.length > 0) {
    lines.push('Division Rankings')
    lines.push(
      'Rank,Division ID,Division Name,Club Count,Membership Total,Score'
    )
    analytics.divisionRankings.forEach(division => {
      lines.push(
        `${division.rank},${escapeCSV(division.divisionId)},${escapeCSV(division.divisionName)},${division.clubCount},${division.membershipTotal},${division.score.toFixed(2)}`
      )
    })
    lines.push('')
  }

  // Top performing areas (using analytics-core AreaPerformance type)
  if (analytics.topPerformingAreas && analytics.topPerformingAreas.length > 0) {
    lines.push('Top Performing Areas')
    lines.push(
      'Area ID,Area Name,Division ID,Club Count,Membership Total,Score'
    )
    analytics.topPerformingAreas.forEach(area => {
      lines.push(
        `${escapeCSV(area.areaId)},${escapeCSV(area.areaName)},${escapeCSV(area.divisionId)},${area.clubCount},${area.membershipTotal},${area.score.toFixed(2)}`
      )
    })
  }

  return lines.join('\n')
}
