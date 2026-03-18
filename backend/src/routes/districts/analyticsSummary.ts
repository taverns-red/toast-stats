/**
 * Aggregated Analytics Summary Route
 *
 * Provides a single endpoint that returns combined analytics data from
 * pre-computed analytics and time-series index for fast retrieval.
 *
 * Requirements:
 * - 4.1: Provide a single aggregated endpoint that returns analytics, distinguished
 *        club analytics, and leadership insights in one response
 * - 4.4: Support the same query parameters (startDate, endDate) as individual endpoints
 * - 8.8: Route SHALL NOT call AnalyticsEngine for year-over-year data
 * - 17.1: Route SHALL NOT contain the calculateDistinguishedProjection function
 * - 17.2: distinguishedProjection SHALL be read from pre-computed analytics files
 */

import { Router, type Request, type Response } from 'express'
import { cacheMiddleware } from '../../middleware/cache.js'
import { requestDeduplicationMiddleware } from '../../middleware/requestDeduplication.js'
import { generateDistrictCacheKey } from '../../utils/cacheKeys.js'
import { logger } from '../../utils/logger.js'
import { transformErrorResponse } from '../../utils/transformers.js'
import {
  getValidDistrictId,
  validateDateFormat,
  getTimeSeriesIndexService,
  extractStringParam,
  snapshotStore,
  cacheDirectory,
  analyticsFileReader,
} from './shared.js'
import { PreComputedAnalyticsReader } from '../../services/PreComputedAnalyticsReader.js'

export const analyticsSummaryRouter = Router()

// ──── CDN deprecation notice ────
// This endpoint is being superseded by Cloud CDN at cdn.taverns.red.
// It remains active as fallback but will be sunset in a future release.
analyticsSummaryRouter.use((_req, res, next) => {
  res.set('Deprecation', 'true')
  res.set('Sunset', '2026-07-01')
  res.set('Link', '<https://cdn.taverns.red>; rel="successor-version"')
  next()
})

// Create PreComputedAnalyticsReader instance for reading year-over-year data
const preComputedAnalyticsReader = new PreComputedAnalyticsReader({
  cacheDir: cacheDirectory,
  readFile: analyticsFileReader,
})

/**
 * Response type for the aggregated analytics endpoint
 *
 * Combines summary data from pre-computed analytics with trend data
 * from the time-series index for efficient retrieval.
 */
interface AggregatedAnalyticsResponse {
  districtId: string
  dateRange: { start: string; end: string }

  // Summary data (from pre-computed analytics)
  summary: {
    totalMembership: number
    membershipChange: number
    memberCountChange: number
    clubCounts: {
      total: number
      thriving: number
      vulnerable: number
      interventionRequired: number
    }
    distinguishedClubs: {
      smedley: number
      presidents: number
      select: number
      distinguished: number
      total: number
    }
    distinguishedProjection: number
  }

  // Trend data (from time-series index)
  trends: {
    membership: Array<{ date: string; count: number }>
    payments?: Array<{ date: string; payments: number }>
  }

  // Year-over-year comparison
  yearOverYear?: {
    membershipChange: number
    distinguishedChange: number
    clubHealthChange: number
  }

  // Performance targets (from latest snapshot)
  performanceTargets?: {
    membershipTarget?: number
    distinguishedTarget?: number
    clubGrowthTarget?: number
  }

  // Metadata
  dataSource: 'precomputed' | 'computed'
  computedAt: string
}

/**
 * GET /api/districts/:districtId/analytics-summary
 *
 * Returns aggregated analytics data combining:
 * - Summary metrics from pre-computed analytics
 * - Trend data from time-series index
 * - Year-over-year comparison
 *
 * Query params:
 * - startDate (optional): Start date for trend data (YYYY-MM-DD)
 * - endDate (optional): End date for trend data (YYYY-MM-DD)
 *
 * Requirements:
 * - 4.1: Single aggregated endpoint returning analytics in one response
 * - 4.4: Support startDate and endDate query parameters
 * - 6.1: Process only one request and share result with all waiting clients
 */
analyticsSummaryRouter.get(
  '/:districtId/analytics-summary',
  // Request deduplication middleware - prevents redundant processing of concurrent identical requests
  // Requirement 6.1: Process only one request and share result with all waiting clients
  requestDeduplicationMiddleware({
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'analytics-summary-dedup', {
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      })
    },
  }),
  cacheMiddleware({
    ttl: 300, // 5 minutes cache for analytics summary
    keyGenerator: req => {
      const districtId = extractStringParam(
        req.params['districtId'],
        'districtId'
      )
      return generateDistrictCacheKey(districtId, 'analytics-summary', {
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      })
    },
  }),
  async (req: Request, res: Response) => {
    const startTime = Date.now()
    const operationId = `analytics_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    try {
      const districtId = getValidDistrictId(req)
      const startDate = req.query['startDate']
      const endDate = req.query['endDate']

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

      logger.info('Processing analytics summary request', {
        operation: 'getAnalyticsSummary',
        operationId,
        districtId,
        startDate,
        endDate,
      })

      // Validate date formats if provided
      if (
        startDate &&
        typeof startDate === 'string' &&
        !validateDateFormat(startDate)
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
        !validateDateFormat(endDate)
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

      // Get services
      const timeSeriesIndexService = await getTimeSeriesIndexService()

      // Get the latest successful snapshot first - needed for all analytics reads
      // Requirement 1.5: Return 404 when no successful snapshot exists
      const latestSnapshot = await snapshotStore.getLatestSuccessful()
      if (!latestSnapshot) {
        const duration = Date.now() - startTime

        logger.error('No successful snapshot available', {
          operation: 'analyticsRequest',
          operationId,
          districtId,
          analytics_gap: true,
          recommendation: 'Run collector-cli to generate snapshots',
          duration_ms: duration,
        })

        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_AVAILABLE',
            message: `Pre-computed analytics are not available for district ${districtId}. No successful snapshot exists.`,
            details: {
              districtId,
              recommendation:
                'Run collector-cli compute-analytics to generate pre-computed analytics for this snapshot.',
            },
          },
        })
        return
      }

      // Determine date range for queries
      const effectiveEndDate =
        typeof endDate === 'string'
          ? endDate
          : new Date().toISOString().split('T')[0]

      // Default to current program year start if no start date provided
      const effectiveStartDate =
        typeof startDate === 'string'
          ? startDate
          : getProgramYearStartDate(
              effectiveEndDate ?? new Date().toISOString().split('T')[0] ?? ''
            )

      // Read summary data from per-district analytics file (single call for all per-district data)
      // Requirement 1.1: Read summary data from PreComputedAnalyticsReader.readDistrictAnalytics()
      // Requirement 3.1: Single call for summary, distinguished projection, and all per-district data
      const summary = await preComputedAnalyticsReader.readDistrictAnalytics(
        latestSnapshot.snapshot_id,
        districtId
      )

      // Requirement 3.3: Extract distinguishedProjection from the single readDistrictAnalytics() result
      const distinguishedProjectionValue =
        summary?.distinguishedProjection?.projectedDistinguished ?? 0

      // Get trend data from time-series index
      let trendData: Array<{ date: string; count: number }> = []
      let paymentsTrend: Array<{ date: string; payments: number }> = []

      try {
        let timeSeriesData = await timeSeriesIndexService.getTrendData(
          districtId,
          effectiveStartDate ?? '',
          effectiveEndDate ?? ''
        )

        // Requirement 1.1: If the initial query returns zero data points,
        // expand to the full program year range for the requested end date
        if (timeSeriesData.length === 0) {
          const programYearStart = getProgramYearStartDate(
            effectiveEndDate ?? ''
          )
          const programYearEnd = getProgramYearEndDate(effectiveEndDate ?? '')

          logger.debug(
            'Initial trend query returned empty, expanding to full program year',
            {
              operation: 'getAnalyticsSummary',
              operationId,
              districtId,
              originalStart: effectiveStartDate,
              originalEnd: effectiveEndDate,
              expandedStart: programYearStart,
              expandedEnd: programYearEnd,
            }
          )

          timeSeriesData = await timeSeriesIndexService.getTrendData(
            districtId,
            programYearStart,
            programYearEnd
          )
        }

        trendData = timeSeriesData.map(dp => ({
          date: dp.date,
          count: dp.membership,
        }))

        paymentsTrend = timeSeriesData.map(dp => ({
          date: dp.date,
          payments: dp.payments,
        }))

        logger.debug('Retrieved trend data from time-series index', {
          operation: 'getAnalyticsSummary',
          operationId,
          districtId,
          dataPointCount: timeSeriesData.length,
        })
      } catch (trendError) {
        logger.warn('Failed to get trend data from time-series index', {
          operation: 'getAnalyticsSummary',
          operationId,
          districtId,
          error:
            trendError instanceof Error ? trendError.message : 'Unknown error',
        })
        // Continue without trend data - we can still return summary
      }

      // Calculate year-over-year comparison from pre-computed data
      // Requirement 8.8: Route SHALL NOT call AnalyticsEngine for year-over-year data
      let yearOverYear: AggregatedAnalyticsResponse['yearOverYear'] | undefined

      try {
        // Get the latest snapshot date for reading pre-computed year-over-year data
        const latestSnapshot = await snapshotStore.getLatestSuccessful()

        if (latestSnapshot) {
          const yoyComparison =
            await preComputedAnalyticsReader.readYearOverYear(
              latestSnapshot.snapshot_id,
              districtId
            )

          if (
            yoyComparison &&
            yoyComparison.dataAvailable &&
            yoyComparison.metrics
          ) {
            yearOverYear = {
              membershipChange:
                yoyComparison.metrics.membership.percentageChange,
              distinguishedChange:
                yoyComparison.metrics.distinguishedClubs.percentageChange,
              clubHealthChange:
                yoyComparison.metrics.clubHealth.thrivingClubs.percentageChange,
            }
          }
        }
      } catch (yoyError) {
        logger.debug('Year-over-year comparison not available', {
          operation: 'getAnalyticsSummary',
          operationId,
          districtId,
          error: yoyError instanceof Error ? yoyError.message : 'Unknown error',
        })
        // Year-over-year is optional, continue without it
      }

      // If pre-computed analytics are not available, return 404 error
      // Requirement 1.1: Return HTTP 404 when pre-computed analytics not available
      // Requirement 1.4: Do NOT fall back to on-demand analytics computation
      if (!summary) {
        const duration = Date.now() - startTime

        // Requirement 3.1, 3.2, 3.3, 3.4: Enhanced error logging
        logger.error('Pre-computed analytics not available', {
          operation: 'analyticsRequest',
          operationId,
          districtId,
          snapshotId: 'latest', // We checked the latest snapshot
          analytics_gap: true,
          recommendation: 'Run collector-cli compute-analytics',
          duration_ms: duration,
        })

        // Requirement 1.2, 1.3, 1.5: Return 404 with clear error message and details
        res.status(404).json({
          error: {
            code: 'ANALYTICS_NOT_AVAILABLE',
            message: `Pre-computed analytics are not available for district ${districtId}. Run collector-cli compute-analytics to generate them.`,
            details: {
              districtId,
              recommendation:
                'Run collector-cli compute-analytics to generate pre-computed analytics for this snapshot.',
            },
          },
        })
        return
      }

      // Build the response using pre-computed data
      // Requirement 17.1: Route SHALL NOT contain the calculateDistinguishedProjection function
      // Requirement 17.2: distinguishedProjection SHALL be read from pre-computed analytics files
      const response: AggregatedAnalyticsResponse = {
        districtId,
        dateRange: {
          start: effectiveStartDate ?? '',
          end: effectiveEndDate ?? '',
        },
        summary: {
          totalMembership: summary.totalMembership,
          membershipChange: summary.membershipChange,
          memberCountChange: summary.memberCountChange ?? 0,
          clubCounts: {
            total: summary.allClubs.length,
            thriving: summary.thrivingClubs.length,
            vulnerable: summary.vulnerableClubs.length,
            interventionRequired: summary.interventionRequiredClubs.length,
          },
          distinguishedClubs: {
            smedley: summary.distinguishedClubs.smedley,
            presidents: summary.distinguishedClubs.presidents,
            select: summary.distinguishedClubs.select,
            distinguished: summary.distinguishedClubs.distinguished,
            total: summary.distinguishedClubs.total,
          },
          distinguishedProjection: distinguishedProjectionValue,
        },
        trends: {
          membership: trendData,
          payments: paymentsTrend.length > 0 ? paymentsTrend : undefined,
        },
        yearOverYear,
        dataSource: 'precomputed',
        computedAt: latestSnapshot.created_at,
      }

      const duration = Date.now() - startTime

      // Log performance metrics
      // Requirement 11.1: Log total processing time and whether pre-computed data was used
      logger.info('Analytics request completed', {
        operation: 'analyticsRequest',
        districtId,
        duration_ms: duration,
        data_source: response.dataSource,
        trendDataPoints: response.trends.membership.length,
        hasYearOverYear: !!response.yearOverYear,
      })

      // Requirement 11.2: Log warning if response time exceeds 5 seconds
      if (duration > 5000) {
        logger.warn('Analytics request exceeded 5 second threshold', {
          operation: 'analyticsRequest',
          districtId,
          duration_ms: duration,
          data_source: response.dataSource,
          warning: true,
        })
      }

      // Set cache control headers
      res.set('Cache-Control', 'public, max-age=300') // 5 minutes

      res.json(response)
    } catch (error) {
      const duration = Date.now() - startTime
      const errorResponse = transformErrorResponse(error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to generate analytics summary'

      logger.error('Analytics summary request failed', {
        operation: 'getAnalyticsSummary',
        operationId,
        error: errorMessage,
        durationMs: duration,
      })

      // Check for specific error messages
      if (
        errorMessage.includes('No cached data available') ||
        errorMessage.includes('No snapshot data found') ||
        errorMessage.includes('No district data found')
      ) {
        res.status(404).json({
          error: {
            code: 'NO_DATA_AVAILABLE',
            message: 'No cached data available for analytics',
            details: 'Run collector-cli to collect historical data',
          },
        })
        return
      }

      if (
        errorMessage.includes('ENOENT') ||
        errorMessage.includes('EACCES') ||
        errorMessage.includes('snapshot store') ||
        errorMessage.includes('Failed to read')
      ) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Snapshot store is temporarily unavailable',
            details: 'Please try again later',
          },
        })
        return
      }

      res.status(500).json({
        error: {
          code: errorResponse.code || 'ANALYTICS_ERROR',
          message: errorMessage,
          details:
            errorResponse.details ||
            'An unexpected error occurred while generating analytics summary.',
        },
      })
    }
  }
)

/**
 * Calculate the program year start date for a given date
 *
 * Toastmasters program years run from July 1 to June 30.
 * For example:
 * - 2024-01-15 is in program year 2023-2024, which starts 2023-07-01
 * - 2024-08-15 is in program year 2024-2025, which starts 2024-07-01
 */
function getProgramYearStartDate(dateStr: string): string {
  const parts = dateStr.split('-')
  const year = parseInt(parts[0] ?? '0', 10)
  const month = parseInt(parts[1] ?? '0', 10)

  // If month is July (7) or later, program year starts this year
  // If month is before July, program year started last year
  if (month >= 7) {
    return `${year}-07-01`
  } else {
    return `${year - 1}-07-01`
  }
}

/**
 * Calculate the program year end date for a given date
 *
 * Toastmasters program years run from July 1 to June 30.
 * For example:
 * - 2024-01-15 is in program year 2023-2024, which ends 2024-06-30
 * - 2024-08-15 is in program year 2024-2025, which ends 2025-06-30
 */
function getProgramYearEndDate(dateStr: string): string {
  const parts = dateStr.split('-')
  const year = parseInt(parts[0] ?? '0', 10)
  const month = parseInt(parts[1] ?? '0', 10)

  // If month is July (7) or later, program year ends next year June 30
  // If month is before July, program year ends this year June 30
  if (month >= 7) {
    return `${year + 1}-06-30`
  } else {
    return `${year}-06-30`
  }
}
