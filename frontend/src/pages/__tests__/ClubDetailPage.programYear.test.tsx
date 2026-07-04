/**
 * PY-selector tests for ClubDetailPage (#1302, epic #1298 Sprint 3).
 *
 * ClubDetailPage already read `?py=` and filtered trends by it, but rendered NO
 * selector — users had to edit the URL or use back. It must now expose the
 * shared DataControlsBar PY chip, re-query when the PY changes, and honor a
 * `?py=` deep link (data-driven default from Sprint 1).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
  })),
}))

// PY2025 → 2025-08-01, 2026-05-01 (latest); PY2026 → 2026-08-01 (latest).
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '61',
      dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
      count: 3,
      dateRange: { startDate: '2025-08-01', endDate: '2026-08-01' },
    },
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
    count: 3,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

const baseMockClub = {
  clubId: '00000606',
  clubName: 'St Lawrence Toastmasters',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  membershipTrend: [{ date: '2026-05-01', count: 46 }],
  dcpGoalsTrend: [{ date: '2026-05-01', goalsAchieved: 8 }],
  membershipBase: 46,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
}

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: { districtId: '61', allClubs: [baseMockClub] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  ClubTrend: {},
}))

const mockedAnalytics = vi.mocked(useDistrictAnalytics)

const LocationProbe = () => {
  const { search } = useLocation()
  return <div data-testid="loc-search">{search}</div>
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[url]}>
            <LocationProbe />
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const lastAnalyticsEndDate = () => {
  const calls = mockedAnalytics.mock.calls
  return calls[calls.length - 1]?.[2]
}

describe('ClubDetailPage — program year selector (#1302)', () => {
  it('renders the PY selector chip (replaces URL-edit/back workaround)', async () => {
    renderAt('/district/61/club/00000606')
    expect(await screen.findByTestId('py-chip')).toBeInTheDocument()
  })

  it('honors a ?py= deep link and fetches that PY latest snapshot', async () => {
    renderAt('/district/61/club/00000606?py=2025')
    await screen.findByTestId('py-chip')
    expect(screen.getByTestId('py-chip-select')).toHaveValue('2025')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-05-01'))
  })

  it('re-queries and updates the URL when the PY selector changes', async () => {
    renderAt('/district/61/club/00000606')
    await screen.findByTestId('py-chip')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-08-01'))

    await userEvent.selectOptions(screen.getByTestId('py-chip-select'), '2025')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-05-01'))
    await waitFor(() =>
      expect(screen.getByTestId('loc-search').textContent).toContain('py=2025')
    )
  })
})
