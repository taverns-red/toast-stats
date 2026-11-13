/**
 * #2740 review follow-ups: the lazy "Changes" diff when it fails, is empty, is
 * still loading, or the district changes. `useSnapshotDiff` is a live fake so
 * each state can be set without waiting out the real query's retries.
 */

import React, { Suspense, useSyncExternalStore } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import { exportSnapshotDiff } from '../../utils/csvExport'
import { columnMeta } from '../../components/clubsColumnMeta'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

interface FakeDiffState {
  data: unknown
  isLoading: boolean
  isFetching: boolean
  isError: boolean
}

const fake = vi.hoisted(() => {
  const idle = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
  }
  let state: FakeDiffState = idle
  const listeners = new Set<() => void>()
  return {
    idle,
    refetch: vi.fn(),
    get: () => state,
    set: (next: FakeDiffState) => {
      state = next
      listeners.forEach(l => l())
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
})

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

const diffOf = (bothPresent: unknown[]) => ({
  districtId: '61',
  from: { date: '2025-07-01' },
  to: { date: '2025-07-15' },
  clubs: { bothPresent, onlyInFrom: [], onlyInTo: [] },
  events: [],
})

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
}))
vi.mock('../../utils/csvExport', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/csvExport')>()),
  exportSnapshotDiff: vi.fn(),
}))
vi.mock('../../hooks/useSnapshotDiff', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../hooks/useSnapshotDiff')>()
  return {
    ...actual,
    useSnapshotDiff: vi.fn(
      (
        _districtId: string | undefined,
        _from: string | undefined,
        _to: string | undefined,
        options: { enabled?: boolean } = {}
      ) => {
        const state = useSyncExternalStore(fake.subscribe, fake.get)
        return {
          ...(options.enabled === false ? fake.idle : state),
          refetch: fake.refetch,
        }
      }
    ),
  }
})

import { useSnapshotDiff } from '../../hooks/useSnapshotDiff'

const DistrictClubsPage = React.lazy(() => import('../DistrictClubsPage'))

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
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return { ...utils, router }
}

const exportButton = () =>
  screen.getByRole('button', { name: /export changes|exporting data/i })
const openColumns = async () =>
  userEvent.click(screen.getByRole('button', { name: /^columns/i }))
const changesCheckbox = () =>
  screen.getByRole('checkbox', { name: columnMeta['deltaMembership']!.label })

beforeEach(() => {
  fake.set(fake.idle)
  fake.refetch.mockClear()
  vi.mocked(exportSnapshotDiff).mockClear()
  window.localStorage.clear()
})
afterEach(() => cleanup())

describe('Export Changes when the lazy diff fails (#2740)', () => {
  it('shows an announced error, not a stuck busy button, when the read fails after the click', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await userEvent.click(exportButton())
    expect(exportButton()).toHaveAttribute('aria-busy', 'true')
    act(() => fake.set({ ...fake.idle, isError: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load/i
    )
    expect(exportButton()).toHaveAttribute('aria-busy', 'false')
    expect(exportSnapshotDiff).not.toHaveBeenCalled()
  })

  it('shows the error at once when the read had already failed before the click', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await openColumns()
    act(() => fake.set({ ...fake.idle, isError: true }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(exportButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load/i
    )
    expect(exportButton()).toHaveAttribute('aria-busy', 'false')
  })
})

describe('Export Changes with a resolved lazy diff (#2740)', () => {
  it('downloads the diff once it loads', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await userEvent.click(exportButton())
    const diff = diffOf([{ clubId: '1001' }])
    act(() => fake.set({ ...fake.idle, data: diff }))
    await waitFor(() => expect(exportSnapshotDiff).toHaveBeenCalledWith(diff))
    expect(exportSnapshotDiff).toHaveBeenCalledTimes(1)
    expect(exportButton()).toHaveAttribute('aria-busy', 'false')
  })

  it('does not download an empty diff, and says so', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await userEvent.click(exportButton())
    act(() => fake.set({ ...fake.idle, data: diffOf([]) }))
    await waitFor(() =>
      expect(screen.getByText(/no changes to export/i)).toBeInTheDocument()
    )
    expect(exportSnapshotDiff).not.toHaveBeenCalled()
  })
})

describe('Changes group in the Columns menu (#2740)', () => {
  it('explains a failed read inside the group, disables its boxes, and retries on open', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await openColumns()
    act(() => fake.set({ ...fake.idle, isError: true }))
    expect(
      await screen.findByText(/changes could not be loaded/i)
    ).toBeVisible()
    expect(changesCheckbox()).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await openColumns()
    expect(fake.refetch).toHaveBeenCalled()
  })

  it('disables the Changes boxes while the diff is loading', async () => {
    renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await openColumns()
    act(() => fake.set({ ...fake.idle, isLoading: true, isFetching: true }))
    await waitFor(() => expect(changesCheckbox()).toBeDisabled())
    act(() => fake.set({ ...fake.idle, data: diffOf([{ clubId: '1001' }]) }))
    await waitFor(() => expect(changesCheckbox()).toBeEnabled())
  })
})

describe('Lazy diff follows the district (#2740)', () => {
  it('goes back to not wanting the diff when the district changes', async () => {
    const { router } = renderAt('/district/61/clubs')
    await screen.findByText(/alpha toastmasters/i)
    await openColumns()
    const lastEnabled = () => {
      const calls = vi.mocked(useSnapshotDiff).mock.calls
      return calls[calls.length - 1]![3]?.enabled
    }
    await waitFor(() => expect(lastEnabled()).toBe(true))
    await act(async () => {
      await router.navigate('/district/62/clubs')
    })
    await waitFor(() => expect(lastEnabled()).toBe(false))
  })
})
