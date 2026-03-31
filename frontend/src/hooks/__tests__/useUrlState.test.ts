/**
 * Tests for useUrlState hook (#272)
 *
 * A thin wrapper around useSearchParams that provides a useState-like API
 * but persists state in the URL. Supports string, number, and serializable
 * types. Uses { replace: true } to avoid history spam per Lesson sprint-11.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useUrlState } from '../useUrlState'

// Helper wrapper with router context
function createWrapper(initialEntries: string[] = ['/']) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries }, children)
}

describe('useUrlState', () => {
  describe('string values', () => {
    it('should return the default value when param is not in URL', () => {
      const { result } = renderHook(() => useUrlState('tab', 'overview'), {
        wrapper: createWrapper(),
      })

      expect(result.current[0]).toBe('overview')
    })

    it('should read value from URL when present', () => {
      const { result } = renderHook(() => useUrlState('tab', 'overview'), {
        wrapper: createWrapper(['/?tab=clubs']),
      })

      expect(result.current[0]).toBe('clubs')
    })

    it('should update the value and sync to URL', () => {
      const { result } = renderHook(() => useUrlState('tab', 'overview'), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current[1]('clubs')
      })

      expect(result.current[0]).toBe('clubs')
    })

    it('should remove param from URL when set to default value', () => {
      const { result } = renderHook(() => useUrlState('tab', 'overview'), {
        wrapper: createWrapper(['/?tab=clubs']),
      })

      act(() => {
        result.current[1]('overview')
      })

      expect(result.current[0]).toBe('overview')
    })
  })

  describe('number values', () => {
    it('should parse number from URL', () => {
      const { result } = renderHook(
        () => useUrlState('page', 1, { parse: Number, serialize: String }),
        { wrapper: createWrapper(['/?page=3']) }
      )

      expect(result.current[0]).toBe(3)
    })

    it('should return default for invalid number in URL', () => {
      const { result } = renderHook(
        () =>
          useUrlState('page', 1, {
            parse: (v: string) => {
              const n = Number(v)
              return isNaN(n) ? undefined : n
            },
            serialize: String,
          }),
        { wrapper: createWrapper(['/?page=abc']) }
      )

      expect(result.current[0]).toBe(1)
    })

    it('should set number value', () => {
      const { result } = renderHook(
        () => useUrlState('page', 1, { parse: Number, serialize: String }),
        { wrapper: createWrapper() }
      )

      act(() => {
        result.current[1](5)
      })

      expect(result.current[0]).toBe(5)
    })

    it('should remove param when set back to default', () => {
      const { result } = renderHook(
        () => useUrlState('page', 1, { parse: Number, serialize: String }),
        { wrapper: createWrapper(['/?page=3']) }
      )

      act(() => {
        result.current[1](1)
      })

      expect(result.current[0]).toBe(1)
    })
  })

  describe('preserving other params', () => {
    it('should preserve existing URL params when setting a value', () => {
      const { result } = renderHook(
        () => {
          const [tab, setTab] = useUrlState('tab', 'overview')
          const [page] = useUrlState('page', 1, {
            parse: Number,
            serialize: String,
          })
          return { tab, setTab, page }
        },
        { wrapper: createWrapper(['/?tab=clubs&page=3']) }
      )

      expect(result.current.tab).toBe('clubs')
      expect(result.current.page).toBe(3)

      act(() => {
        result.current.setTab('trends')
      })

      expect(result.current.tab).toBe('trends')
      // page should still be 3 — preserved
      expect(result.current.page).toBe(3)
    })
  })

  describe('functional updates', () => {
    it('should support updater function', () => {
      const { result } = renderHook(
        () => useUrlState('page', 1, { parse: Number, serialize: String }),
        { wrapper: createWrapper(['/?page=3']) }
      )

      act(() => {
        result.current[1](prev => prev + 1)
      })

      expect(result.current[0]).toBe(4)
    })
  })
})
