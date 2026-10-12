/**
 * useAfterPaint (#1901) — the gate a route uses to start a heavy,
 * below-the-fold read only after its first screen has painted.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAfterPaint, AFTER_PAINT_FALLBACK_MS } from '../useAfterPaint'

describe('useAfterPaint', () => {
  let rafCallbacks: ((time: number) => void)[]

  beforeEach(() => {
    vi.useFakeTimers()
    rafCallbacks = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const runFrame = () => {
    const cbs = rafCallbacks.splice(0)
    cbs.forEach(cb => cb(performance.now()))
  }

  it('stays closed while not ready, however long it waits', () => {
    const { result } = renderHook(() => useAfterPaint(false))
    act(() => {
      runFrame()
      vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS * 4)
    })
    expect(result.current).toBe(false)
  })

  it('opens after the frame that follows readiness has painted', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    // Same render, no frame yet: still closed.
    expect(result.current).toBe(false)
    act(() => runFrame())
    // rAF runs before the paint; the open is the task after it.
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe(true)
  })

  it('opens on the fallback timer when no frame fires (hidden tab)', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    act(() => vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS))
    expect(result.current).toBe(true)
  })

  it('never closes again once open', () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useAfterPaint(ready),
      { initialProps: { ready: true } }
    )
    act(() => vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS))
    expect(result.current).toBe(true)
    rerender({ ready: false })
    expect(result.current).toBe(true)
  })
})
