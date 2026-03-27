/**
 * Tests for ClubDetailPage (#208) — full subpage with routing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock matchMedia (required by DarkModeContext)
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

// ── Mock hooks ──────────────────────────────────────────────────────────────

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: {
      districts: [{ id: '61', name: 'District 61' }],
    },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: { dates: ['2025-10-15'] },
  })),
}))

const mockClub = {
  clubId: '00000606',
  clubName: 'St Lawrence Toastmasters',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  membershipTrend: [
    { date: '2025-07-31', count: 46 },
    { date: '2025-08-31', count: 47 },
    { date: '2025-09-30', count: 51 },
    { date: '2025-10-31', count: 41 },
  ],
  dcpGoalsTrend: [
    { date: '2025-07-31', goalsAchieved: 2 },
    { date: '2025-10-31', goalsAchieved: 8 },
  ],
  membershipBase: 46,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 5,
  aprilRenewals: 3,
  newMembers: 2,
}

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: {
      districtId: '61',
      allClubs: [mockClub],
    },
    isLoading: false,
    error: null,
  })),
  ClubTrend: {},
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderWithRoute(clubId: string = '00000606') {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[`/district/61/club/${clubId}`]}>
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

describe('ClubDetailPage (#208)', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders club name and breadcrumbs', () => {
    renderWithRoute()

    // Club name appears in breadcrumb + heading
    expect(
      screen.getAllByText('St Lawrence Toastmasters').length
    ).toBeGreaterThanOrEqual(1)

    // Breadcrumbs
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('District 61')).toBeInTheDocument()
  })

  it('renders membership stats grid with correct net change', () => {
    renderWithRoute()

    // Stats labels
    expect(screen.getByText('Base')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Net Change')).toBeInTheDocument()
    expect(screen.getByText('DCP Goals')).toBeInTheDocument()

    // Net Change = -5 (appears in stats grid + chart)
    expect(screen.getAllByText('-5').length).toBeGreaterThanOrEqual(1)
  })

  it('renders not found state for invalid club ID', () => {
    renderWithRoute('99999999')

    expect(screen.getByText('Club Not Found')).toBeInTheDocument()
  })

  it('renders DCP status section', () => {
    renderWithRoute()

    expect(screen.getByText('DCP Status')).toBeInTheDocument()
    expect(screen.getByText('Current Level')).toBeInTheDocument()
    expect(screen.getByText('Distinguished Outlook')).toBeInTheDocument()
  })

  it('renders DCP Goals Progress section', () => {
    renderWithRoute()

    expect(screen.getByText('DCP Goals Progress')).toBeInTheDocument()
    expect(screen.getByText('8 / 10 goals')).toBeInTheDocument()
  })
})
