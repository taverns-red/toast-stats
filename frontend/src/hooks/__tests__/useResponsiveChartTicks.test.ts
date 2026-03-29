/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { useResponsiveTickInterval } from '../useResponsiveChartTicks'

describe('useResponsiveTickInterval', () => {
  const originalInnerWidth = window.innerWidth

  afterEach(() => {
    // Restore window.innerWidth to its original value after each test
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    vi.restoreAllMocks()
  })

  const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    })
  }

  it('returns "preserveStartEnd" for desktop viewports (>=768px)', () => {
    setViewportWidth(1024)
    const { result } = renderHook(() => useResponsiveTickInterval(20))
    expect(result.current).toBe('preserveStartEnd')
  })

  it('returns "preserveStartEnd" for small datasets (<=4 items) even on mobile', () => {
    setViewportWidth(375)
    // 4 items is below the threshold for thinning
    const { result } = renderHook(() => useResponsiveTickInterval(4))
    expect(result.current).toBe('preserveStartEnd')
  })

  it('thins labels to every 2nd or 3rd on tablet viewports (480px-767px) for large datasets', () => {
    setViewportWidth(600)

    // 15 items should thin by Math.max(Math.ceil(15/6) - 1, 1) = Math.max(3-1, 1) = 2
    const { result: res1 } = renderHook(() => useResponsiveTickInterval(15))
    expect(res1.current).toBe(2)

    // 30 items should thin by Math.max(Math.ceil(30/6) - 1, 1) = Math.max(5-1, 1) = 4
    const { result: res2 } = renderHook(() => useResponsiveTickInterval(30))
    expect(res2.current).toBe(4)
  })

  it('thins labels to every 3rd or 4th on phone viewports (<480px) for large datasets', () => {
    setViewportWidth(375)

    // 12 items should thin by Math.max(Math.ceil(12/4) - 1, 2) = Math.max(3-1, 2) = 2
    const { result: res1 } = renderHook(() => useResponsiveTickInterval(12))
    expect(res1.current).toBe(2)

    // 24 items should thin by Math.max(Math.ceil(24/4) - 1, 2) = Math.max(6-1, 2) = 5
    const { result: res2 } = renderHook(() => useResponsiveTickInterval(24))
    expect(res2.current).toBe(5)
  })

  it('handles empty datasets safely', () => {
    setViewportWidth(375)
    const { result } = renderHook(() => useResponsiveTickInterval(0))
    expect(result.current).toBe('preserveStartEnd')
  })
})
