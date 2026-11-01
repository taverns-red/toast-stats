import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAfterIdle } from '../useAfterIdle'

/* #2427 — below-the-fold work that must not compete with LCP waits for the
   first idle period after it is enabled. */

describe('useAfterIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('stays false until enabled, then turns true on the next idle callback', () => {
    let idle: (() => void) | undefined
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((cb: () => void) => {
        idle = cb
        return 1
      })
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    const { result, rerender } = renderHook(({ on }) => useAfterIdle(on), {
      initialProps: { on: false },
    })
    expect(result.current).toBe(false)
    expect(idle).toBeUndefined()
    rerender({ on: true })
    expect(result.current).toBe(false)
    act(() => idle!())
    expect(result.current).toBe(true)
    // Latched.
    rerender({ on: false })
    expect(result.current).toBe(true)
  })

  it('falls back to a timeout without requestIdleCallback (Safari)', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const { result } = renderHook(() => useAfterIdle(true))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(true)
  })
})
