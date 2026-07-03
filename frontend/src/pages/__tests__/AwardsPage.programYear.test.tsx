/**
 * PY-selector tests for AwardsPage (#1301, epic #1298 Sprint 2).
 *
 * The competitive-awards standings are PY-scoped but the page historically
 * fetched only "latest". It must now expose the shared DataControlsBar PY chip,
 * re-query the awards snapshot when the PY changes, and honor a `?py=` deep
 * link.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import AwardsPage from '../AwardsPage'
import { fetchCdnCompetitiveAwards } from '../../services/cdn'

const LocationProbe = () => {
  const { search } = useLocation()
  return <div data-testid="loc-search">{search}</div>
}

afterEach(() => cleanup())

vi.mock('../../services/cdn', () => {
  const standings = {
    metadata: {
      snapshotId: 'snap',
      calculatedAt: '2026-08-01T00:00:00Z',
      totalDistricts: 117,
    },
    extensionAward: [
      {
        districtId: '01',
        districtName: 'District 01',
        region: '01',
        rank: 1,
        value: 5,
        isWinner: true,
      },
    ],
    twentyPlusAward: [],
    retentionAward: [],
    byDistrict: {},
  }
  return {
    // PY2025: 2025-08-01, 2026-05-01 (latest) · PY2026: 2026-08-01 (latest)
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
      count: 3,
      generatedAt: '2026-08-02T00:00:00Z',
    }),
    fetchCdnManifest: vi
      .fn()
      .mockResolvedValue({ latestSnapshotDate: '2026-08-01' }),
    fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(standings),
  }
})

const mockedAwards = vi.mocked(fetchCdnCompetitiveAwards)

const renderAt = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <LocationProbe />
          <Routes>
            <Route path="/awards" element={<AwardsPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('AwardsPage — program year selector (#1301)', () => {
  it('renders the PY selector chip', async () => {
    renderAt('/awards')
    expect(await screen.findByTestId('py-chip')).toBeInTheDocument()
  })

  it('defaults to the newest PY-with-data and fetches its awards snapshot', async () => {
    renderAt('/awards')
    await screen.findByTestId('py-chip')
    await waitFor(() => expect(mockedAwards).toHaveBeenCalledWith('2026-08-01'))
    expect(screen.getByTestId('loc-search').textContent).not.toContain('py=')
  })

  it('honors a ?py= deep link and fetches that PY awards snapshot', async () => {
    renderAt('/awards?py=2025')
    await screen.findByTestId('py-chip')
    // The PY options come from the dates query — wait for it to populate so the
    // select can resolve its value against a matching <option>.
    await waitFor(() =>
      expect(screen.getByTestId('py-chip-select')).toHaveValue('2025')
    )
    await waitFor(() => expect(mockedAwards).toHaveBeenCalledWith('2026-05-01'))
  })

  it('re-queries when the PY selector changes', async () => {
    renderAt('/awards')
    await screen.findByTestId('py-chip')
    await waitFor(() => expect(mockedAwards).toHaveBeenCalledWith('2026-08-01'))
    mockedAwards.mockClear()

    await userEvent.selectOptions(screen.getByTestId('py-chip-select'), '2025')
    await waitFor(() => expect(mockedAwards).toHaveBeenCalledWith('2026-05-01'))
    await waitFor(() =>
      expect(screen.getByTestId('loc-search').textContent).toContain('py=2025')
    )
  })
})
