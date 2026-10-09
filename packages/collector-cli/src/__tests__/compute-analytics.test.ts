/**
 * Unit Tests for compute-analytics CLI command
 *
 * Tests the CLI command integration for computing analytics from existing snapshots.
 *
 * Requirements:
 * - 5.2: WHEN computing analytics, THE Collector_CLI SHALL compare the current
 *        snapshot checksum with the checksum used in the last computation
 * - 1.5: IF analytics computation fails for a district, THEN the Collector_CLI
 *        SHALL continue processing other districts and log the error
 *
 * Note: Core behaviors (incremental skip, error isolation) are tested in
 * AnalyticsComputeService.test.ts. This file focuses on CLI-specific tests.
 */

import { describe, it, expect } from 'vitest'
import {
  determineComputeAnalyticsExitCode,
  formatComputeAnalyticsSummary,
} from '../cli.js'
import { ExitCode, ComputeAnalyticsResult } from '../types/index.js'

/**
 * Helper to create a ComputeAnalyticsResult for testing
 */
function createComputeResult(
  overrides: Partial<ComputeAnalyticsResult> = {}
): ComputeAnalyticsResult {
  return {
    success: true,
    date: '2024-01-15',
    requestedDate: '2024-01-15',
    isClosingPeriod: false,
    districtsProcessed: [],
    districtsSucceeded: [],
    districtsFailed: [],
    districtsSkipped: [],
    analyticsLocations: [],
    errors: [],
    duration_ms: 100,
    ...overrides,
  }
}

describe('compute-analytics CLI command', () => {
  describe('determineComputeAnalyticsExitCode', () => {
    it('returns SUCCESS (0) when all districts succeed', () => {
      const result = createComputeResult({
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1', '2', '3'],
        districtsFailed: [],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(ExitCode.SUCCESS)
    })

    it('returns SUCCESS (0) when all districts are skipped (incremental behavior)', () => {
      // Requirement 5.2: Skip computation when snapshot checksum unchanged
      const result = createComputeResult({
        districtsProcessed: ['1', '2'],
        districtsSucceeded: [],
        districtsFailed: [],
        districtsSkipped: ['1', '2'],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(ExitCode.SUCCESS)
    })

    it('returns SUCCESS (0) when mix of succeeded and skipped', () => {
      const result = createComputeResult({
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1'],
        districtsFailed: [],
        districtsSkipped: ['2', '3'],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(ExitCode.SUCCESS)
    })

    it('returns PARTIAL_FAILURE (1) when some districts fail (Requirement 1.5)', () => {
      // Requirement 1.5: Continue processing other districts when one fails
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1', '2'],
        districtsFailed: ['3'],
        errors: [
          {
            districtId: '3',
            error: 'Snapshot not found',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(
        ExitCode.PARTIAL_FAILURE
      )
    })

    it('returns COMPLETE_FAILURE (2) when all districts fail', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2'],
        districtsSucceeded: [],
        districtsFailed: ['1', '2'],
        errors: [
          {
            districtId: '1',
            error: 'Snapshot not found',
            timestamp: new Date().toISOString(),
          },
          {
            districtId: '2',
            error: 'Invalid JSON',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(
        ExitCode.COMPLETE_FAILURE
      )
    })

    it('returns COMPLETE_FAILURE (2) when no districts processed', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        errors: [
          {
            districtId: 'N/A',
            error: 'Snapshot not found for date 2024-01-15',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      expect(determineComputeAnalyticsExitCode(result)).toBe(
        ExitCode.COMPLETE_FAILURE
      )
    })
  })

  describe('formatComputeAnalyticsSummary', () => {
    const analyticsDir = '/cache/snapshots/2024-01-15/analytics'

    it('formats successful result with correct structure', () => {
      const result = createComputeResult({
        districtsProcessed: ['1', '2'],
        districtsSucceeded: ['1', '2'],
        analyticsLocations: [
          '/cache/snapshots/2024-01-15/analytics/district_1_analytics.json',
          '/cache/snapshots/2024-01-15/analytics/district_2_analytics.json',
        ],
        duration_ms: 1500,
      })

      const summary = formatComputeAnalyticsSummary(result, analyticsDir)

      expect(summary.status).toBe('success')
      expect(summary.date).toBe('2024-01-15')
      expect(summary.districts.total).toBe(2)
      expect(summary.districts.succeeded).toBe(2)
      expect(summary.districts.failed).toBe(0)
      expect(summary.districts.skipped).toBe(0)
      expect(summary.analytics.directory).toBe(analyticsDir)
      expect(summary.analytics.filesCreated).toBe(2)
      expect(summary.errors).toEqual([])
      expect(summary.duration_ms).toBe(1500)
      expect(summary.timestamp).toBeDefined()
    })

    it('formats partial failure result correctly', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1', '2'],
        districtsFailed: ['3'],
        analyticsLocations: [
          '/cache/snapshots/2024-01-15/analytics/district_1_analytics.json',
          '/cache/snapshots/2024-01-15/analytics/district_2_analytics.json',
        ],
        errors: [
          {
            districtId: '3',
            error: 'Snapshot not found for district 3',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const summary = formatComputeAnalyticsSummary(result, analyticsDir)

      expect(summary.status).toBe('partial')
      expect(summary.districts.total).toBe(3)
      expect(summary.districts.succeeded).toBe(2)
      expect(summary.districts.failed).toBe(1)
      expect(summary.errors).toHaveLength(1)
      expect(summary.errors[0]?.districtId).toBe('3')
      expect(summary.errors[0]?.error).toContain('Snapshot not found')
    })

    it('formats complete failure result correctly', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: [],
        districtsSucceeded: [],
        districtsFailed: [],
        errors: [
          {
            districtId: 'N/A',
            error: 'Snapshot not found for date 2024-01-15',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const summary = formatComputeAnalyticsSummary(result, analyticsDir)

      expect(summary.status).toBe('failed')
      expect(summary.districts.total).toBe(0)
      expect(summary.errors).toHaveLength(1)
    })

    it('formats result with skipped districts correctly (incremental skip)', () => {
      // Requirement 5.2: Skip when checksum unchanged
      const result = createComputeResult({
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1'],
        districtsFailed: [],
        districtsSkipped: ['2', '3'],
        analyticsLocations: [
          '/cache/snapshots/2024-01-15/analytics/district_1_analytics.json',
        ],
      })

      const summary = formatComputeAnalyticsSummary(result, analyticsDir)

      expect(summary.status).toBe('success')
      expect(summary.districts.total).toBe(3)
      expect(summary.districts.succeeded).toBe(1)
      expect(summary.districts.skipped).toBe(2)
      expect(summary.analytics.filesCreated).toBe(1)
    })
  })

  describe('exit code and status consistency', () => {
    it('exit code SUCCESS matches status "success"', () => {
      const result = createComputeResult({
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
      })

      const exitCode = determineComputeAnalyticsExitCode(result)
      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(exitCode).toBe(ExitCode.SUCCESS)
      expect(summary.status).toBe('success')
    })

    it('exit code PARTIAL_FAILURE matches status "partial"', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2'],
        districtsSucceeded: ['1'],
        districtsFailed: ['2'],
        errors: [
          {
            districtId: '2',
            error: 'Test error',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const exitCode = determineComputeAnalyticsExitCode(result)
      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(exitCode).toBe(ExitCode.PARTIAL_FAILURE)
      expect(summary.status).toBe('partial')
    })

    it('exit code COMPLETE_FAILURE matches status "failed"', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1'],
        districtsSucceeded: [],
        districtsFailed: ['1'],
        errors: [
          {
            districtId: '1',
            error: 'Test error',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const exitCode = determineComputeAnalyticsExitCode(result)
      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(exitCode).toBe(ExitCode.COMPLETE_FAILURE)
      expect(summary.status).toBe('failed')
    })
  })

  describe('error isolation (Requirement 1.5)', () => {
    it('reports multiple errors when multiple districts fail', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2', '3', '4'],
        districtsSucceeded: ['1', '2'],
        districtsFailed: ['3', '4'],
        errors: [
          {
            districtId: '3',
            error: 'Snapshot not found',
            timestamp: new Date().toISOString(),
          },
          {
            districtId: '4',
            error: 'Invalid JSON in snapshot',
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(summary.errors).toHaveLength(2)
      expect(summary.errors.map(e => e.districtId)).toEqual(['3', '4'])
      expect(summary.districts.succeeded).toBe(2)
      expect(summary.districts.failed).toBe(2)
    })

    it('preserves error messages in summary', () => {
      const errorMessage =
        'Snapshot file corrupted: unexpected token at position 42'
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1'],
        districtsSucceeded: [],
        districtsFailed: ['1'],
        errors: [
          {
            districtId: '1',
            error: errorMessage,
            timestamp: new Date().toISOString(),
          },
        ],
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(summary.errors[0]?.error).toBe(errorMessage)
    })
  })

  describe('JSON output structure (ComputeAnalyticsSummary)', () => {
    it('includes all required fields', () => {
      const result = createComputeResult({
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
        analyticsLocations: ['/path/to/analytics.json'],
        duration_ms: 500,
      })

      const summary = formatComputeAnalyticsSummary(
        result,
        '/cache/snapshots/2024-01-15/analytics'
      )

      // Verify all required fields are present
      expect(summary).toHaveProperty('timestamp')
      expect(summary).toHaveProperty('date')
      expect(summary).toHaveProperty('requestedDate')
      expect(summary).toHaveProperty('isClosingPeriod')
      expect(summary).toHaveProperty('status')
      expect(summary).toHaveProperty('districts')
      expect(summary).toHaveProperty('analytics')
      expect(summary).toHaveProperty('errors')
      expect(summary).toHaveProperty('duration_ms')

      // Verify nested structure
      expect(summary.districts).toHaveProperty('total')
      expect(summary.districts).toHaveProperty('succeeded')
      expect(summary.districts).toHaveProperty('failed')
      expect(summary.districts).toHaveProperty('skipped')
      expect(summary.analytics).toHaveProperty('directory')
      expect(summary.analytics).toHaveProperty('filesCreated')
    })

    it('includes closing period info when date adjustment was made', () => {
      // Requirement 8.2: Report actual snapshot date used
      const result = createComputeResult({
        date: '2024-01-31', // Adjusted date (last day of data month)
        requestedDate: '2024-02-04', // Original requested date
        isClosingPeriod: true,
        dataMonth: '2024-01',
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(summary.date).toBe('2024-01-31')
      expect(summary.requestedDate).toBe('2024-02-04')
      expect(summary.isClosingPeriod).toBe(true)
      expect(summary.dataMonth).toBe('2024-01')
    })

    it('does not include dataMonth when not a closing period', () => {
      const result = createComputeResult({
        date: '2024-01-15',
        requestedDate: '2024-01-15',
        isClosingPeriod: false,
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(summary.date).toBe('2024-01-15')
      expect(summary.requestedDate).toBe('2024-01-15')
      expect(summary.isClosingPeriod).toBe(false)
      expect(summary.dataMonth).toBeUndefined()
    })

    it('timestamp is valid ISO format', () => {
      const result = createComputeResult({
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      // Should be parseable as a date
      const parsedDate = new Date(summary.timestamp)
      expect(parsedDate.toISOString()).toBe(summary.timestamp)
    })

    it('status is one of the valid enum values', () => {
      const validStatuses = ['success', 'partial', 'failed']

      // Test success
      const successResult = createComputeResult({
        districtsProcessed: ['1'],
        districtsSucceeded: ['1'],
      })
      expect(validStatuses).toContain(
        formatComputeAnalyticsSummary(successResult, '/analytics').status
      )

      // Test partial
      const partialResult = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2'],
        districtsSucceeded: ['1'],
        districtsFailed: ['2'],
        errors: [{ districtId: '2', error: 'err', timestamp: '' }],
      })
      expect(validStatuses).toContain(
        formatComputeAnalyticsSummary(partialResult, '/analytics').status
      )

      // Test failed
      const failedResult = createComputeResult({
        success: false,
        districtsProcessed: [],
        errors: [{ districtId: 'N/A', error: 'err', timestamp: '' }],
      })
      expect(validStatuses).toContain(
        formatComputeAnalyticsSummary(failedResult, '/analytics').status
      )
    })
  })

  // #1708: the step summaries printed "districts computed" only, so a run
  // that wrote no time-series point (#1702) looked like a normal day.
  describe('store write counters (#1708)', () => {
    it('reports timeSeries, clubTrends and clubRace written/failed', () => {
      const result = createComputeResult({
        success: false,
        districtsProcessed: ['1', '2', '3'],
        districtsSucceeded: ['1', '2'],
        districtsFailed: ['3'],
        timeSeriesWritten: ['1'],
        timeSeriesFailed: ['2'],
        clubTrendsUpdated: ['1', '2'],
        clubTrendsFailed: ['3'],
        clubRaceStorePath: '/cache/club-race/2025-2026.json',
        clubRaceStoreFailed: false,
      })

      const summary = formatComputeAnalyticsSummary(result, '/analytics')

      expect(summary.timeSeries).toEqual({ written: 1, failed: 1 })
      expect(summary.clubTrends).toEqual({ written: 2, failed: 1 })
      expect(summary.clubRace).toEqual({ written: 1, failed: 0 })
    })

    it('counts a club-race store failure and a skipped (no rankings) date', () => {
      const failed = formatComputeAnalyticsSummary(
        createComputeResult({ clubRaceStoreFailed: true }),
        '/analytics'
      )
      expect(failed.clubRace).toEqual({ written: 0, failed: 1 })

      const skipped = formatComputeAnalyticsSummary(
        createComputeResult(),
        '/analytics'
      )
      expect(skipped.timeSeries).toEqual({ written: 0, failed: 0 })
      expect(skipped.clubTrends).toEqual({ written: 0, failed: 0 })
      expect(skipped.clubRace).toEqual({ written: 0, failed: 0 })
    })
  })
})
