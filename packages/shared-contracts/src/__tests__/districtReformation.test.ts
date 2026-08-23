/**
 * Tests for the 2026 district-reformation discontinuity signal (#1442).
 *
 * This is the shared detector every year-over-year site consults before
 * presenting a cross-boundary comparison. Issue #1443 ("What Changed"
 * reformation context) consumes the same helper.
 */

import { describe, it, expect } from 'vitest'
import {
  DISTRICT_REFORMATION_DATE,
  DISTRICT_REFORMATION_PROGRAM_YEAR,
  DISTRICT_REFORMATION_NOTICE,
  REFORMATION_RELATIVE_THRESHOLD,
  REFORMATION_MIN_ABSOLUTE_CHANGE,
  spansDistrictReformation,
  programYearStartDate,
  programYearStartYear,
  detectReformationDiscontinuity,
} from '../reformation/districtReformation.js'

describe('spansDistrictReformation', () => {
  it('is true when the prior date is before and the current date is on/after the boundary', () => {
    expect(spansDistrictReformation('2025-11-30', '2026-11-30')).toBe(true)
    expect(
      spansDistrictReformation('2026-06-30', DISTRICT_REFORMATION_DATE)
    ).toBe(true)
  })

  it('is false when both dates sit on the same side of the boundary', () => {
    expect(spansDistrictReformation('2024-11-30', '2025-11-30')).toBe(false)
    expect(spansDistrictReformation('2026-07-01', '2027-07-01')).toBe(false)
  })

  it('is false for a reversed or malformed pair', () => {
    expect(spansDistrictReformation('2026-11-30', '2025-11-30')).toBe(false)
    expect(spansDistrictReformation('', '2026-11-30')).toBe(false)
    expect(spansDistrictReformation('2025-11-30', 'not-a-date')).toBe(false)
  })
})

describe('program-year helpers', () => {
  it('maps a program-year label or start year to its July 1 start date', () => {
    expect(programYearStartDate(2025)).toBe('2025-07-01')
    expect(programYearStartDate('2026-2027')).toBe('2026-07-01')
    expect(programYearStartDate(DISTRICT_REFORMATION_PROGRAM_YEAR)).toBe(
      DISTRICT_REFORMATION_DATE
    )
  })

  it('extracts the start year from a program-year label', () => {
    expect(programYearStartYear('2025-2026')).toBe(2025)
    expect(programYearStartYear(2025)).toBe(2025)
    expect(programYearStartYear('garbage')).toBeNull()
  })
})

describe('detectReformationDiscontinuity', () => {
  const across = { previousDate: '2025-11-30', currentDate: '2026-11-30' }

  it('flags a district that absorbed another across the boundary', () => {
    const result = detectReformationDiscontinuity({
      ...across,
      previousCount: 60,
      currentCount: 108,
    })

    expect(result.isDiscontinuous).toBe(true)
    expect(result.reason).toBe('population-discontinuity')
    expect(result.spansReformation).toBe(true)
    expect(result.message).toBe(DISTRICT_REFORMATION_NOTICE)
    expect(result.absoluteChange).toBe(48)
    expect(result.relativeChange).toBeCloseTo(0.8, 5)
  })

  it('flags a district that was split apart across the boundary', () => {
    const result = detectReformationDiscontinuity({
      ...across,
      previousCount: 120,
      currentCount: 70,
    })

    expect(result.isDiscontinuous).toBe(true)
    expect(result.reason).toBe('population-discontinuity')
    expect(result.absoluteChange).toBe(-50)
  })

  it('leaves a stable roster comparable across the boundary', () => {
    const result = detectReformationDiscontinuity({
      ...across,
      previousCount: 82,
      currentCount: 79,
    })

    expect(result.isDiscontinuous).toBe(false)
    expect(result.reason).toBe('comparable')
    expect(result.message).toBeNull()
  })

  it('never fires for a comparison that does not span the reformation', () => {
    const result = detectReformationDiscontinuity({
      previousDate: '2024-11-30',
      currentDate: '2025-11-30',
      previousCount: 60,
      currentCount: 108,
    })

    expect(result.isDiscontinuous).toBe(false)
    expect(result.reason).toBe('does-not-span-reformation')
    expect(result.spansReformation).toBe(false)
  })

  it('requires BOTH the relative and the absolute floor', () => {
    // 6 clubs on a base of 12 is 50% relative but below the absolute floor —
    // a tiny district's ordinary churn must not be called a reformation.
    const tiny = detectReformationDiscontinuity({
      ...across,
      previousCount: 12,
      currentCount: 18,
    })
    expect(tiny.isDiscontinuous).toBe(false)
    expect(tiny.reason).toBe('comparable')

    // 10 clubs on a base of 200 clears the absolute floor but is only 5%.
    const large = detectReformationDiscontinuity({
      ...across,
      previousCount: 200,
      currentCount: 210,
    })
    expect(large.isDiscontinuous).toBe(false)
    expect(large.reason).toBe('comparable')
  })

  it('reports no baseline rather than dividing by zero', () => {
    for (const previousCount of [0, null, undefined]) {
      const result = detectReformationDiscontinuity({
        ...across,
        previousCount,
        currentCount: 100,
      })
      expect(result.isDiscontinuous).toBe(false)
      expect(result.reason).toBe('no-baseline')
      expect(result.relativeChange).toBeNull()
    }

    const missingCurrent = detectReformationDiscontinuity({
      ...across,
      previousCount: 100,
      currentCount: null,
    })
    expect(missingCurrent.reason).toBe('no-baseline')
  })

  it('exposes its thresholds so the operator can retune without hunting', () => {
    expect(REFORMATION_RELATIVE_THRESHOLD).toBeGreaterThan(0)
    expect(REFORMATION_RELATIVE_THRESHOLD).toBeLessThan(1)
    expect(REFORMATION_MIN_ABSOLUTE_CHANGE).toBeGreaterThan(0)
  })

  it('accepts program-year labels for rank-field comparisons', () => {
    const result = detectReformationDiscontinuity({
      previousDate: programYearStartDate('2025-2026'),
      currentDate: programYearStartDate('2026-2027'),
      previousCount: 126,
      currentCount: 101,
    })

    expect(result.spansReformation).toBe(true)
    expect(result.isDiscontinuous).toBe(true)
  })
})
