/**
 * useDistrictProgramYearControls (#1302, epic #1298 Sprint 3).
 *
 * District-scoped sibling of useProgramYearControls: the shared PY/date wiring
 * that DivisionPage, AreaPage, and ClubDetailPage need. Dates come from the
 * per-district snapshot index (useDistrictCachedDates), not the global
 * ['available-dates'] query — but the derivation (available PYs, in-PY dates,
 * effective end date, self-heal to newest) mirrors the proven inline logic in
 * DistrictClubsPage / DistrictDivisionsPage.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { useDistrictProgramYearControls } from '../useDistrictProgramYearControls'

// District 61 snapshot index: PY2025 → 2025-08-01, 2026-05-01 (latest);
// PY2026 → 2026-08-01 (latest).
vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({
    '61': ['2025-08-01', '2026-05-01', '2026-08-01'],
  }),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
    count: 3,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
}))

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

const wrapperFor = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProgramYearProvider>
          <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
        </ProgramYearProvider>
      </QueryClientProvider>
    )
  }
}

describe('useDistrictProgramYearControls (#1302)', () => {
  it('derives available program years (newest first) from the district index', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61'),
    })
    await waitFor(() =>
      expect(result.current.availableProgramYears.length).toBe(2)
    )
    expect(result.current.availableProgramYears.map(py => py.year)).toEqual([
      2026, 2025,
    ])
  })

  it('honors a ?py= deep link: effective end date is that PY latest snapshot', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61?py=2025'),
    })
    await waitFor(() =>
      expect(result.current.effectiveProgramYear?.year).toBe(2025)
    )
    expect(result.current.effectiveEndDate).toBe('2026-05-01')
    // Dates within the selected PY (order is DataControlsBar's concern).
    expect([...result.current.availableDates].sort()).toEqual([
      '2025-08-01',
      '2026-05-01',
    ])
    expect(result.current.hasValidDates).toBe(true)
    // Viewing a prior PY's latest (2026-05-01) is NOT the district's overall
    // newest snapshot (2026-08-01) → freshness must not flag reconciliation.
    expect(result.current.latestSnapshotDate).toBe('2026-08-01')
    expect(result.current.isLatestSnapshot).toBe(false)
  })

  it('flags isLatestSnapshot when the effective end date is the district newest (#1310)', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61?py=2026'),
    })
    await waitFor(() =>
      expect(result.current.effectiveProgramYear?.year).toBe(2026)
    )
    // PY2026 latest === the district's overall newest snapshot.
    expect(result.current.effectiveEndDate).toBe('2026-08-01')
    expect(result.current.latestSnapshotDate).toBe('2026-08-01')
    expect(result.current.isLatestSnapshot).toBe(true)
  })

  it('self-heals a PY with no district data to the newest available year', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61?py=2019'),
    })
    // 2019 has no snapshots → effective year falls back to the newest (2026)
    // AND the selected year is rewritten to match (selfHeal default).
    await waitFor(() =>
      expect(result.current.effectiveProgramYear?.year).toBe(2026)
    )
    await waitFor(() =>
      expect(result.current.selectedProgramYear.year).toBe(2026)
    )
    expect(result.current.effectiveEndDate).toBe('2026-08-01')
  })

  it('with selfHeal:false, derives the effective year WITHOUT rewriting the selection', async () => {
    const { result } = renderHook(
      () => useDistrictProgramYearControls('61', { selfHeal: false }),
      { wrapper: wrapperFor('/district/61?py=2019') }
    )
    // Effective year still heals to the newest with data...
    await waitFor(() =>
      expect(result.current.effectiveProgramYear?.year).toBe(2026)
    )
    // ...but the selected year stays put — no URL write to clobber nav state.
    expect(result.current.selectedProgramYear.year).toBe(2019)
    expect(result.current.effectiveEndDate).toBe('2026-08-01')
  })

  // #2635 — a ?date= that is not one of the district's snapshots must never
  // reach a fetch, the chip, or the freshness pill as if it were loaded.
  describe('a ?date= with no snapshot (#2635)', () => {
    it('never returns an end date outside the district snapshot list', async () => {
      for (const date of [
        '2020-01-01',
        '2027-05-01',
        '2026-03-15',
        'notadate',
      ]) {
        const { result, unmount } = renderHook(
          () => useDistrictProgramYearControls('61'),
          { wrapper: wrapperFor(`/district/61?date=${date}`) }
        )
        await waitFor(() => expect(result.current.hasValidDates).toBe(true))
        expect(['2025-08-01', '2026-05-01', '2026-08-01']).toContain(
          result.current.effectiveEndDate
        )
        unmount()
      }
    })

    it('a date before all data falls back to the PY latest and the selection names the date on screen', async () => {
      const { result } = renderHook(
        () => useDistrictProgramYearControls('61'),
        {
          wrapper: wrapperFor('/district/61?py=2019&date=2020-01-01'),
        }
      )
      await waitFor(() =>
        expect(result.current.effectiveEndDate).toBe('2026-08-01')
      )
      // The chip must never name the requested (absent) date.
      expect(result.current.selectedDate).not.toBe('2020-01-01')
    })

    it('a missing date inside the PY resolves to the nearest earlier snapshot', async () => {
      const { result } = renderHook(
        () => useDistrictProgramYearControls('61'),
        {
          wrapper: wrapperFor('/district/61?py=2025&date=2026-02-10'),
        }
      )
      await waitFor(() => expect(result.current.hasValidDates).toBe(true))
      expect(result.current.effectiveEndDate).toBe('2025-08-01')
      expect(result.current.selectedDate).toBe('2025-08-01')
    })

    it('a snapshot date from another PY switches the PY', async () => {
      const { result } = renderHook(
        () => useDistrictProgramYearControls('61'),
        {
          wrapper: wrapperFor('/district/61?date=2026-05-01'),
        }
      )
      await waitFor(() =>
        expect(result.current.effectiveProgramYear?.year).toBe(2025)
      )
      expect(result.current.effectiveEndDate).toBe('2026-05-01')
      expect(result.current.selectedDate).toBe('2026-05-01')
      expect(result.current.selectedProgramYear.year).toBe(2025)
    })
  })
})
