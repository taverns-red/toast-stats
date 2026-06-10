/**
 * Helper functions for aggregated analytics — fetch and data conversion.
 * No React dependencies — fully testable in isolation.
 *
 * CDN-only strategy: fetches pre-computed JSON from Cloud CDN (#168, #173).
 * The Express `/analytics-summary` endpoint has been deleted.
 */

import {
  fetchCdnManifest,
  cdnAnalyticsUrl,
  fetchFromCdn,
} from '../../services/cdn'
import type { DistrictAnalytics } from '../useDistrictAnalytics'
import type { AggregatedAnalyticsResponse, TrendData } from './types'

/**
 * Fetch district analytics from Cloud CDN.
 *
 * CDN path: cdn.taverns.red/snapshots/{date}/analytics/district_{id}_analytics.json
 *
 * This is the sole data source — no Express fallback (#173).
 */
export async function fetchIndividualAnalytics(
  districtId: string,
  snapshotDate?: string
): Promise<DistrictAnalytics> {
  const date = snapshotDate || (await fetchCdnManifest()).latestSnapshotDate
  const url = cdnAnalyticsUrl(date, districtId, 'analytics')
  const file = await fetchFromCdn<{ data: DistrictAnalytics }>(url)
  return file.data
}

/**
 * Convert individual analytics response to aggregated format.
 *
 * Populates yearOverYear from the CDN analytics data, fixing the Overview
 * tab "— —" and "N/A" placeholders that appeared after the Express
 * /analytics-summary route was deleted (#173).
 */
export function convertToAggregatedFormat(
  analytics: DistrictAnalytics
): AggregatedAnalyticsResponse {
  // Build trends object, only including payments if it exists
  const trends: TrendData = {
    membership: analytics.membershipTrend,
  }
  if (analytics.paymentsTrend) {
    trends.payments = analytics.paymentsTrend
  }

  // Handle distinguishedProjection - it may be a number or an object from the CDN
  let projectionValue: number
  const projection = analytics.distinguishedProjection
  if (typeof projection === 'number') {
    projectionValue = projection
  } else if (projection && typeof projection === 'object') {
    // Extract the projectedDistinguished value directly (simplified data model)
    const projObj = projection as {
      projectedDistinguished?: number
    }
    projectionValue = projObj.projectedDistinguished ?? 0
  } else {
    projectionValue = 0
  }

  // Build the base response
  const response: AggregatedAnalyticsResponse = {
    districtId: analytics.districtId,
    dateRange: analytics.dateRange,
    summary: {
      totalMembership: analytics.totalMembership,
      membershipChange: analytics.membershipChange,
      memberCountChange: analytics.memberCountChange ?? 0,
      clubCounts: {
        total:
          analytics.thrivingClubs.length +
          analytics.vulnerableClubs.length +
          analytics.interventionRequiredClubs.length,
        thriving: analytics.thrivingClubs.length,
        vulnerable: analytics.vulnerableClubs.length,
        interventionRequired: analytics.interventionRequiredClubs.length,
      },
      distinguishedClubs: {
        smedley: analytics.distinguishedClubs.smedley,
        presidents: analytics.distinguishedClubs.presidents,
        select: analytics.distinguishedClubs.select,
        distinguished: analytics.distinguishedClubs.distinguished,
        total: analytics.distinguishedClubs.total,
      },
      distinguishedProjection: projectionValue,
    },
    trends,
    dataSource: 'computed',
    computedAt: new Date().toISOString(),
  }

  // Populate yearOverYear from CDN analytics data (#173)
  if (analytics.yearOverYear) {
    response.yearOverYear = analytics.yearOverYear
  }

  return response
}
