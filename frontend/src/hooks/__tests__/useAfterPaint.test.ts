/**
 * useAfterPaint (#1901) — the gate a route uses to start a heavy,
 * below-the-fold read only after its first screen has painted.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useAfterPaint,
  AFTER_PAINT_FALLBACK_MS,
  LCP_WAIT_CAP_MS,
  resetAfterPaintStateForTests,
} from '../useAfterPaint'

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

/**
 * #2777 — Lighthouse charges every request that finishes before the LCP
 * paint. The gate used to open one rAF + macrotask after readiness, which can
 * be BEFORE the frame is presented, so the post-paint reads (rankings,
 * analytics, club history) sometimes started and finished ahead of the LCP
 * timestamp: the club route's simulated LCP flipped between ~3.6 s and ~4.2 s.
 * Where the browser reports LCP, the gate waits for the LCP entry itself.
 */
describe('useAfterPaint with LCP entries (#2777)', () => {
  type LcpCallback = (list: {
    getEntries: () => { startTime: number }[]
  }) => void
  type Rec = { cb: LcpCallback; disconnected: boolean }
  let observers: Rec[]
  let now: number

  const emitLcp = (startTime: number) =>
    observers
      .filter(o => !o.disconnected)
      .forEach(o => o.cb({ getEntries: () => [{ startTime }] }))

  beforeEach(() => {
    resetAfterPaintStateForTests()
    vi.useFakeTimers()
    observers = []
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      window.setTimeout(() => cb(now), 16)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    class FakeObserver {
      static supportedEntryTypes = ['largest-contentful-paint']
      private rec: Rec
      constructor(cb: LcpCallback) {
        this.rec = { cb, disconnected: false }
        observers.push(this.rec)
      }
      observe() {}
      disconnect() {
        this.rec.disconnected = true
      }
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays closed past the hidden-tab fallback until the LCP entry arrives', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    act(() => {
      vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS * 4)
    })
    expect(result.current).toBe(false)
    act(() => emitLcp(1200))
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe(true)
  })

  it('accepts an LCP entry painted before readiness (slow device)', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    act(() => emitLcp(400))
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe(true)
  })

  it('caps the LCP wait at 400 ms or less', () => {
    expect(LCP_WAIT_CAP_MS).toBeLessThanOrEqual(400)
  })

  it.each(['pointerdown', 'keydown', 'scroll'])(
    'skips the LCP wait after a %s (browsers stop emitting LCP)',
    type => {
      window.dispatchEvent(new Event(type))
      const { result } = renderHook(() => useAfterPaint(true))
      act(() => vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS))
      expect(result.current).toBe(true)
    }
  )

  it('skips the LCP wait on a soft navigation (not the first route mount)', () => {
    const first = renderHook(() => useAfterPaint(false))
    first.unmount()
    const { result } = renderHook(() => useAfterPaint(true))
    // One frame (16 ms in this rAF mock) plus the open task.
    act(() => vi.advanceTimersByTime(16))
    act(() => vi.advanceTimersByTime(0))
    expect(result.current).toBe(true)
    expect(observers).toHaveLength(0)
  })

  it('opens after the wait cap when no LCP entry follows', () => {
    const { result } = renderHook(() => useAfterPaint(true))
    act(() => vi.advanceTimersByTime(LCP_WAIT_CAP_MS - 1))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('keeps the rAF path in a hidden tab, where no LCP entry ever comes', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { result } = renderHook(() => useAfterPaint(true))
    act(() => vi.advanceTimersByTime(AFTER_PAINT_FALLBACK_MS))
    expect(result.current).toBe(true)
  })
})
