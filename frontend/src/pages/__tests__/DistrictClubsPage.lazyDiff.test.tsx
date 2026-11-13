/**
 * #2740 — the clubs route must not fetch the two dated district snapshots the
 * "Changes" diff reads (about 104 KB for District 61) until something needs the
 * diff: the Columns menu opens, a saved Changes column is on, the sort or a
 * filter targets one, or "Export Changes" is clicked. The Changes group and the
 * export button stay offered meanwhile (a previous recorded date exists).
 *
 * The real `useSnapshotDiff` runs here; only the CDN reader is faked.
 */

import React, { Suspense } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import { fetchCdnDistrictSnapshot } from '../../services/cdn'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

const CLUBS: ClubTrend[] = [
  {
    clubId: '1001',
    clubName: 'Alpha Toastmasters',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '11',
    areaName: 'Area 11',
    currentStatus: 'thriving',
    distinguishedLevel: 'Distinguished',
    riskFactors: [],
    membershipTrend: [{ date: '2025-07-01', count: 28 }],
    dcpGoalsTrend: [{ date: '2025-07-01', goalsAchieved: 7 }],
  },
]

vi.mock('../../hooks/useDefaultProgramYear', () => ({
  useDefaultProgramYear: () => ({
    year: 2025,
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    label: '2025-2026',
  }),
}))
vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: { allClubs: CLUBS },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      dates: ['2025-07-01', '2025-07-15'],
      dateRange: { startDate: '2025-07-01', endDate: '2025-07-15' },
    },
    isLoading: false,
  })),
}))
vi.mock('../../hooks/usePriorYearClubGoals', () => ({
  usePriorYearClubGoals: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
}))
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-07-15',
    generatedAt: '2025-07-16T00:00:00Z',
  }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2025-07-15'),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2025-07-15',
    generatedAt: '2025-07-16T00:00:00Z',
  }),
  // Never settles: only the requests matter here.
  fetchCdnDistrictSnapshot: vi.fn(() => new Promise(() => {})),
}))

const DistrictClubsPage = React.lazy(() => import('../DistrictClubsPage'))

// Compile the page graph once, up front (#2248), so the first test's window
// does not measure Vite's cold transform.
beforeAll(async () => {
  await import('../DistrictClubsPage')
})

const renderAt = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/district/:districtId/clubs',
        element: (
          <Suspense fallback={<div>Loading…</div>}>
            <DistrictClubsPage />
          </Suspense>
        ),
      },
    ],
    { initialEntries: [url] }
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const fetchMock = vi.mocked(fetchCdnDistrictSnapshot)

beforeEach(() => {
  fetchMock.mockClear()
  window.localStorage.clear()
})
afterEach(() => cleanup())

describe('DistrictClubsPage snapshot diff is lazy (#2740)', () => {
  it('requests neither dated snapshot on first render', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps Export Changes offered before the diff has loaded', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    expect(
      screen.getByRole('button', { name: /export changes/i })
    ).toBeInTheDocument()
  })

  it('requests both snapshots when the Columns menu opens', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await userEvent.click(screen.getByRole('button', { name: /^columns/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledWith('2025-07-01', '61')
    expect(fetchMock).toHaveBeenCalledWith('2025-07-15', '61')
  })

  it('requests both snapshots when Export Changes is clicked', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await userEvent.click(
      screen.getByRole('button', { name: /export changes/i })
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('requests both snapshots when a Changes column is saved as shown', async () => {
    window.localStorage.setItem(
      'toast-stats:v1:clubs-table:columns',
      JSON.stringify({ schema: 2, overrides: { deltaMembership: true } })
    )
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('requests both snapshots when the sort targets a Changes column', async () => {
    renderAt('/district/61/clubs?sort=deltaMembership&dir=desc')
    await screen.findByText(/alpha toastmasters/i)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
