/* Club page first-load bytes (#2759).
   The worldwide-standing card closes the page, below the DCP goals grid, so
   its `global-club-race.json` read (~9 KB on the wire) must not be part of the
   first load: it starts when the card's slot comes near the viewport. The race
   hook is NOT mocked here; the CDN reader is, so a request is observable. */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { fetchCdnGlobalClubRace } from '../../services/cdn'

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

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({ data: { dates: ['2026-09-11'] } })),
}))

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useGlobalFreshness: vi.fn(() => ({ asOfDate: null, isLatest: true })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-09-11'],
    count: 1,
    generatedAt: '2026-09-12T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnGlobalClubRace: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn().mockResolvedValue(null),
}))

const club = {
  clubId: '3045',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  membershipTrend: [{ date: '2026-09-11', count: 22 }],
  dcpGoalsTrend: [{ date: '2026-09-11', goalsAchieved: 5 }],
  currentStatus: 'thriving',
  healthScore: 80,
  membershipCount: 22,
  membershipBase: 20,
  paymentsCount: 40,
  riskFactors: [],
  distinguishedLevel: 'Distinguished',
  cspSubmitted: true,
  aprilRenewals: 22,
}

// An IntersectionObserver the test drives: nothing is "near" until told.
type Observed = {
  callback: globalThis.IntersectionObserverCallback
  target: Element
}
let observed: Observed[] = []
class ManualIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly scrollMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  constructor(private callback: globalThis.IntersectionObserverCallback) {}
  observe(target: Element): void {
    observed.push({ callback: this.callback, target })
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DarkModeProvider>
        <ProgramYearProvider>
          <MemoryRouter initialEntries={['/district/61/club/3045']}>
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </ProgramYearProvider>
      </DarkModeProvider>
    </QueryClientProvider>
  )

describe('ClubDetailPage — worldwide standing read is lazy (#2759)', () => {
  const realIO = globalThis.IntersectionObserver

  beforeEach(() => {
    observed = []
    vi.stubGlobal('IntersectionObserver', ManualIntersectionObserver)
    vi.mocked(fetchCdnGlobalClubRace).mockClear()
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: { allClubs: [club], districtId: '61' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
  })

  afterEach(() => {
    vi.stubGlobal('IntersectionObserver', realIO)
  })

  it('does not request global-club-race.json on first render', async () => {
    renderPage()
    await screen.findAllByText('Limestone City Club')
    // Let any query that is going to start, start.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(fetchCdnGlobalClubRace).not.toHaveBeenCalled()
  })

  it('requests it once the card slot comes near the viewport', async () => {
    renderPage()
    await screen.findAllByText('Limestone City Club')
    const slot = observed.find(
      o => o.target.getAttribute('data-lazy') === 'worldwide-standing'
    )
    expect(slot).toBeDefined()
    await act(async () => {
      slot!.callback(
        [
          {
            isIntersecting: true,
            target: slot!.target,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    })
    await vi.waitFor(() =>
      expect(fetchCdnGlobalClubRace).toHaveBeenCalledWith('2026-09-11')
    )
  })

  // A reader who presses Cmd-P without scrolling must still get the card.
  it('requests it when a print is requested before the slot is near', async () => {
    renderPage()
    await screen.findAllByText('Limestone City Club')
    expect(fetchCdnGlobalClubRace).not.toHaveBeenCalled()
    await act(async () => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    await vi.waitFor(() =>
      expect(fetchCdnGlobalClubRace).toHaveBeenCalledWith('2026-09-11')
    )
  })

  // Without IntersectionObserver `useNearViewport` never turns true.
  it('requests it without IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    renderPage()
    await screen.findAllByText('Limestone City Club')
    await vi.waitFor(() =>
      expect(fetchCdnGlobalClubRace).toHaveBeenCalledWith('2026-09-11')
    )
  })
})
