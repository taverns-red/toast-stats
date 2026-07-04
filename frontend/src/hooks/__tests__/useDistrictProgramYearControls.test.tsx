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
})
