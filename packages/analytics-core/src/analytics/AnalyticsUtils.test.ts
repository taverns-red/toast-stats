/**
 * AnalyticsUtils Unit Tests
 *
 * Tests for the analytics utility functions.
 *
 * Requirements: 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect } from 'vitest'
import {
  parseIntSafe,
  parseIntOrUndefined,
  ensureString,
  getDCPCheckpoint,
  getCurrentProgramMonth,
  getMonthName,
  findPreviousProgramYearDate,
  calculatePercentageChange,
  determineTrend,
} from './AnalyticsUtils.js'

describe('AnalyticsUtils', () => {
  describe('parseIntSafe', () => {
    it('should parse valid integer strings', () => {
      expect(parseIntSafe('42')).toBe(42)
      expect(parseIntSafe('0')).toBe(0)
      expect(parseIntSafe('-5')).toBe(-5)
    })

    it('should return numbers as-is (floored)', () => {
      expect(parseIntSafe(42)).toBe(42)
      expect(parseIntSafe(3.7)).toBe(3)
    })

    it('should return default value for invalid inputs', () => {
      expect(parseIntSafe(null)).toBe(0)
      expect(parseIntSafe(undefined)).toBe(0)
      expect(parseIntSafe('abc')).toBe(0)
      expect(parseIntSafe('')).toBe(0)
    })

    it('should use custom default value', () => {
      expect(parseIntSafe(null, -1)).toBe(-1)
      expect(parseIntSafe('invalid', 99)).toBe(99)
    })
  })

  describe('parseIntOrUndefined', () => {
    it('should parse valid integer strings', () => {
      expect(parseIntOrUndefined('42')).toBe(42)
      expect(parseIntOrUndefined('0')).toBe(0)
    })

    it('should return undefined for invalid inputs', () => {
      expect(parseIntOrUndefined(null)).toBeUndefined()
      expect(parseIntOrUndefined(undefined)).toBeUndefined()
      expect(parseIntOrUndefined('')).toBeUndefined()
      expect(parseIntOrUndefined('   ')).toBeUndefined()
      expect(parseIntOrUndefined('abc')).toBeUndefined()
    })

    it('should handle numbers', () => {
      expect(parseIntOrUndefined(42)).toBe(42)
      expect(parseIntOrUndefined(3.7)).toBe(3)
      expect(parseIntOrUndefined(NaN)).toBeUndefined()
    })
  })

  describe('ensureString', () => {
    it('should convert values to strings', () => {
      expect(ensureString('hello')).toBe('hello')
      expect(ensureString(42)).toBe('42')
      expect(ensureString(0)).toBe('0')
    })

    it('should return empty string for null/undefined', () => {
      expect(ensureString(null)).toBe('')
      expect(ensureString(undefined)).toBe('')
    })
  })

  describe('getDCPCheckpoint', () => {
    it('should return 0 for July-August (start of program year)', () => {
      expect(getDCPCheckpoint(7)).toBe(0)
      expect(getDCPCheckpoint(8)).toBe(0)
    })

    it('should return 1 for September', () => {
      expect(getDCPCheckpoint(9)).toBe(1)
    })

    it('should return 2 for October-November', () => {
      expect(getDCPCheckpoint(10)).toBe(2)
      expect(getDCPCheckpoint(11)).toBe(2)
    })

    it('should return 3 for December-January', () => {
      expect(getDCPCheckpoint(12)).toBe(3)
      expect(getDCPCheckpoint(1)).toBe(3)
    })

    it('should return 4 for February-March', () => {
      expect(getDCPCheckpoint(2)).toBe(4)
      expect(getDCPCheckpoint(3)).toBe(4)
    })

    it('should return 5 for April-June', () => {
      expect(getDCPCheckpoint(4)).toBe(5)
      expect(getDCPCheckpoint(5)).toBe(5)
      expect(getDCPCheckpoint(6)).toBe(5)
    })

    it('should throw for invalid months', () => {
      expect(() => getDCPCheckpoint(0)).toThrow()
      expect(() => getDCPCheckpoint(13)).toThrow()
      expect(() => getDCPCheckpoint(-1)).toThrow()
    })
  })

  describe('getCurrentProgramMonth', () => {
    it('should parse valid date strings', () => {
      expect(getCurrentProgramMonth('2024-01-15')).toBe(1)
      expect(getCurrentProgramMonth('2024-07-15')).toBe(7)
      expect(getCurrentProgramMonth('2024-12-15')).toBe(12)
    })

    it('should derive the month from the string, not a timezone-shifted Date (#1116 item 2)', () => {
      // `new Date("YYYY-MM-DD")` parses as UTC midnight; `.getMonth()` reads
      // LOCAL time, so in a UTC-negative zone a first-of-month date rolls back
      // to the prior month (a 2026-07-01 snapshot read as June → wrong DCP
      // checkpoint). The month must come from the string itself, TZ-invariant.
      expect(getCurrentProgramMonth('2026-07-01')).toBe(7)
      expect(getCurrentProgramMonth('2026-01-01')).toBe(1)
      expect(getCurrentProgramMonth('2026-12-01')).toBe(12)
    })

    it('should throw for invalid date strings', () => {
      expect(() => getCurrentProgramMonth('invalid')).toThrow()
      expect(() => getCurrentProgramMonth('2024-13-01')).toThrow()
    })

    it('should return current month when no date provided', () => {
      const result = getCurrentProgramMonth()
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(12)
    })
  })

  describe('getMonthName', () => {
    it('should return correct month names', () => {
      expect(getMonthName(1)).toBe('January')
      expect(getMonthName(6)).toBe('June')
      expect(getMonthName(12)).toBe('December')
    })

    it('should return Unknown for invalid months', () => {
      expect(getMonthName(0)).toBe('Unknown')
      expect(getMonthName(13)).toBe('Unknown')
    })
  })

  describe('findPreviousProgramYearDate', () => {
    it('should subtract one year from the date', () => {
      expect(findPreviousProgramYearDate('2024-01-15')).toBe('2023-01-15')
      expect(findPreviousProgramYearDate('2024-07-01')).toBe('2023-07-01')
      expect(findPreviousProgramYearDate('2025-12-31')).toBe('2024-12-31')
    })
  })

  describe('calculatePercentageChange', () => {
    it('should calculate positive percentage change', () => {
      expect(calculatePercentageChange(100, 150)).toBe(50)
      expect(calculatePercentageChange(200, 220)).toBe(10)
    })

    it('should calculate negative percentage change', () => {
      expect(calculatePercentageChange(100, 80)).toBe(-20)
      expect(calculatePercentageChange(200, 150)).toBe(-25)
    })

    it('should handle zero previous value', () => {
      expect(calculatePercentageChange(0, 100)).toBe(100)
      expect(calculatePercentageChange(0, 0)).toBe(0)
    })

    it('should round to one decimal place', () => {
      expect(calculatePercentageChange(3, 4)).toBe(33.3)
    })
  })

  describe('determineTrend', () => {
    it('should return stable for insufficient data', () => {
      expect(determineTrend([])).toBe('stable')
      expect(determineTrend([100])).toBe('stable')
    })

    it('should detect increasing trend', () => {
      expect(determineTrend([100, 110, 120, 130])).toBe('increasing')
      expect(determineTrend([10, 20, 30, 40, 50])).toBe('increasing')
    })

    it('should detect decreasing trend', () => {
      expect(determineTrend([130, 120, 110, 100])).toBe('decreasing')
      expect(determineTrend([50, 40, 30, 20, 10])).toBe('decreasing')
    })

    it('should detect stable trend for small changes', () => {
      expect(determineTrend([100, 101, 100, 101])).toBe('stable')
      expect(determineTrend([100, 100, 100, 100])).toBe('stable')
    })
  })
})
