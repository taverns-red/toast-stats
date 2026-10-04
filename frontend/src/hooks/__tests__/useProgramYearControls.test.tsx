/**
 * Tests for useProgramYearControls (#1301, epic #1298 Sprint 2).
 *
 * The shared PY-controls hook the region/aggregate pages (RegionsPage,
 * RegionPage, AwardsPage) use to drive a DataControlsBar. It wraps
 * useUrlProgramYear (URL-synced ?py=/?date=) plus the ['available-dates']
 * CDN dates query, and derives:
 *   - availableProgramYears (newest first, only years WITH data)
 *   - cachedDates (dates within the selected PY)
 *   - effectiveDate (explicit ?date= or the latest date in the selected PY)
 * It self-heals a ?py= that has no data to the newest available PY (L124).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'

// Dates spanning three program years (Jul 1 – Jun 30 each), two per year.
//   PY2026: 2026-08-01, 2026-09-15
//   PY2025: 2025-08-01, 2026-05-01
//   PY2024: 2024-08-01, 2025-03-01
// vi.mock is hoisted — the fixture is inlined in the factory (can't close over
// an outer const that initializes later).
vi.mock('../../services/cdn', () => {
  const dates = [
    '2024-08-01',
    '2025-03-01',
    '2025-08-01',
    '2026-05-01',
    '2026-08-01',
    '2026-09-15',
  ]
  return {
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates,
      count: dates.length,
      generatedAt: '2026-09-16T00:00:00Z',
    }),
  }
})

import { useProgramYearControls } from '../useProgramYearControls'

function createWrapper(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('useProgramYearControls (#1301)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('derives availableProgramYears from CDN dates, newest first, data-only', async () => {
    const { result } = renderHook(() => useProgramYearControls(), {
      wrapper: createWrapper(),
    })
    await waitFor(() =>
      expect(result.current.availableProgramYears.length).toBe(3)
    )
    expect(result.current.availableProgramYears.map(py => py.year)).toEqual([
      2026, 2025, 2024,
    ])
  })

  it('defaults to the newest PY with data and its latest date', async () => {
    const { result } = renderHook(() => useProgramYearControls(), {
      wrapper: createWrapper(),
    })
    await waitFor(() =>
      expect(result.current.selectedProgramYear.year).toBe(2026)
    )
    // effectiveDate = latest date within PY2026.
    await waitFor(() => expect(result.current.effectiveDate).toBe('2026-09-15'))
    expect(result.current.cachedDates.sort()).toEqual([
      '2026-08-01',
      '2026-09-15',
    ])
  })

  it('honors ?py= and reports that PY latest date', async () => {
    const { result } = renderHook(() => useProgramYearControls(), {
      wrapper: createWrapper(['/?py=2025']),
    })
    await waitFor(() =>
      expect(result.current.selectedProgramYear.year).toBe(2025)
    )
    await waitFor(() => expect(result.current.effectiveDate).toBe('2026-05-01'))
    expect(result.current.cachedDates.sort()).toEqual([
      '2025-08-01',
      '2026-05-01',
    ])
  })

  it('honors an explicit ?date= over the PY latest', async () => {
    const { result } = renderHook(() => useProgramYearControls(), {
      wrapper: createWrapper(['/?py=2025&date=2025-08-01']),
    })
    await waitFor(() => expect(result.current.effectiveDate).toBe('2025-08-01'))
    expect(result.current.selectedDate).toBe('2025-08-01')
  })

  it('self-heals a ?py= with no data to the newest available PY (L124)', async () => {
    const { result } = renderHook(() => useProgramYearControls(), {
      wrapper: createWrapper(['/?py=1999']),
    })
    // 1999 has no snapshots → falls back to the newest PY-with-data (2026).
    await waitFor(() =>
      expect(result.current.selectedProgramYear.year).toBe(2026)
    )
  })

  // #1618 — /clubs and /awards opened on PY 2025-26 while the data's newest PY
  // was 2026-27: a year persisted to localStorage by an EARLIER session
  // outranked the data-resolved default on every later visit.
  describe('a fresh visit always defaults to the data-resolved PY (#1618)', () => {
    it('ignores a program year persisted by a prior session', async () => {
      localStorage.setItem('selectedProgramYear', '2025')
      const { result } = renderHook(() => useProgramYearControls(), {
        wrapper: createWrapper(),
      })
      await waitFor(() =>
        expect(result.current.availableProgramYears.length).toBe(3)
      )
      expect(result.current.selectedProgramYear.year).toBe(2026)
      expect(result.current.effectiveDate).toBe('2026-09-15')
    })

    it('a ?py= link does not pin the default for the next visit', async () => {
      const first = renderHook(() => useProgramYearControls(), {
        wrapper: createWrapper(['/?py=2025']),
      })
      await waitFor(() =>
        expect(first.result.current.effectiveDate).toBe('2026-05-01')
      )
      first.unmount()

      const next = renderHook(() => useProgramYearControls(), {
        wrapper: createWrapper(),
      })
      await waitFor(() =>
        expect(next.result.current.availableProgramYears.length).toBe(3)
      )
      expect(next.result.current.selectedProgramYear.year).toBe(2026)
    })

    it('an explicit pick in one visit does not become the next visit default', async () => {
      const first = renderHook(() => useProgramYearControls(), {
        wrapper: createWrapper(),
      })
      await waitFor(() =>
        expect(first.result.current.availableProgramYears.length).toBe(3)
      )
      act(() => {
        first.result.current.setSelectedProgramYear(
          first.result.current.availableProgramYears[1]!
        )
      })
      await waitFor(() =>
        expect(first.result.current.selectedProgramYear.year).toBe(2025)
      )
      first.unmount()

      const next = renderHook(() => useProgramYearControls(), {
        wrapper: createWrapper(),
      })
      await waitFor(() =>
        expect(next.result.current.availableProgramYears.length).toBe(3)
      )
      expect(next.result.current.selectedProgramYear.year).toBe(2026)
    })
  })
})
