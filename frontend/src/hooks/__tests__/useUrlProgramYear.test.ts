/**
 * Tests for useUrlProgramYear hook (#272)
 *
 * Syncs program year and date selection to URL search params,
 * enabling deep links like /district/61?py=2025&date=2026-04-01.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

// Mock the ProgramYearContext
const mockSetSelectedProgramYear = vi.fn()
const mockSetSelectedDate = vi.fn()

vi.mock('../../contexts/ProgramYearContext', () => ({
  useProgramYear: () => ({
    selectedProgramYear: {
      year: 2025,
      startDate: '2025-07-01',
      endDate: '2026-06-30',
      label: '2025-2026',
    },
    setSelectedProgramYear: mockSetSelectedProgramYear,
    selectedDate: undefined,
    setSelectedDate: mockSetSelectedDate,
  }),
}))

// The `?py=` include/delete comparator keys off the DATA-DRIVEN default program
// year (#1300), not the calendar year. Pin it to 2025-2026 (this file's fixture
// PY) — deliberately different from the calendar current PY (2026-2027 after the
// July rollover) so the assertions falsify the old getCurrentProgramYear() code.
vi.mock('../useDefaultProgramYear', () => ({
  useDefaultProgramYear: () => ({
    year: 2025,
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    label: '2025-2026',
  }),
}))

// Must import after mock
import { useUrlProgramYear } from '../useUrlProgramYear'

// Captures the live URL search string so tests can assert whether ?py= is
// present after a setter call (the hook result alone can't distinguish
// "?py= deleted, fell back to default" from "?py= set to the default year").
// A stable object we mutate a property on — reassigning an outer `let` from a
// component render trips the React Compiler lint rule.
const location = { search: '' }
function LocationProbe() {
  const [sp] = useSearchParams()
  React.useEffect(() => {
    location.search = sp.toString()
  }, [sp])
  return null
}

function createWrapper(initialEntries: string[] = ['/']) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries },
      children,
      React.createElement(LocationProbe)
    )
}

describe('useUrlProgramYear (#272)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('program year', () => {
    it('should return current program year when no ?py= param', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(),
      })

      expect(result.current.selectedProgramYear.year).toBe(2025)
      expect(result.current.selectedProgramYear.label).toBe('2025-2026')
    })

    it('should read program year from ?py= URL param', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?py=2024']),
      })

      expect(result.current.selectedProgramYear.year).toBe(2024)
      expect(result.current.selectedProgramYear.label).toBe('2024-2025')
    })

    it('should update URL when program year changes', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.setSelectedProgramYear({
          year: 2023,
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          label: '2023-2024',
        })
      })

      expect(result.current.selectedProgramYear.year).toBe(2023)
    })

    it('omits ?py= when the selected PY equals the data-driven default (#1300)', () => {
      // The data-driven default is 2025-2026 (mocked). Even though the CALENDAR
      // current PY is 2026-2027 after the July rollover, selecting 2025 must
      // NOT pin ?py= — 2025 is the invisible default.
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?py=2023']),
      })

      act(() => {
        result.current.setSelectedProgramYear({
          year: 2025,
          startDate: '2025-07-01',
          endDate: '2026-06-30',
          label: '2025-2026',
        })
      })

      expect(result.current.selectedProgramYear.year).toBe(2025)
      // ?py= removed because 2025 is the data-driven default.
      expect(new URLSearchParams(location.search).get('py')).toBeNull()
    })

    it('writes ?py= when the selected PY differs from the data-driven default (#1300)', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.setSelectedProgramYear({
          year: 2023,
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          label: '2023-2024',
        })
      })

      expect(result.current.selectedProgramYear.year).toBe(2023)
      expect(new URLSearchParams(location.search).get('py')).toBe('2023')
    })

    it('should sync to context when URL has a different year', () => {
      renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?py=2024']),
      })

      expect(mockSetSelectedProgramYear).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2024 })
      )
    })

    it('should not sync to context when URL matches context year', () => {
      renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?py=2025']),
      })

      // Context already has 2025, so no sync needed
      expect(mockSetSelectedProgramYear).not.toHaveBeenCalled()
    })
  })

  describe('date', () => {
    it('should return undefined when no ?date= param', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(),
      })

      expect(result.current.selectedDate).toBeUndefined()
    })

    it('should read date from ?date= URL param', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?date=2026-04-01']),
      })

      expect(result.current.selectedDate).toBe('2026-04-01')
    })

    it('should update URL when date changes', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.setSelectedDate('2026-03-15')
      })

      expect(result.current.selectedDate).toBe('2026-03-15')
    })

    it('should clear date from URL when set to undefined', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?date=2026-04-01']),
      })

      act(() => {
        result.current.setSelectedDate(undefined)
      })

      expect(result.current.selectedDate).toBeUndefined()
    })

    it('should sync date to context', () => {
      renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?date=2026-04-01']),
      })

      expect(mockSetSelectedDate).toHaveBeenCalledWith('2026-04-01')
    })
  })

  describe('combined params', () => {
    it('should read both py and date from URL', () => {
      const { result } = renderHook(() => useUrlProgramYear(), {
        wrapper: createWrapper(['/?py=2024&date=2025-01-15']),
      })

      expect(result.current.selectedProgramYear.year).toBe(2024)
      expect(result.current.selectedDate).toBe('2025-01-15')
    })
  })
})
