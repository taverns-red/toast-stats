import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, describe, vi } from 'vitest'
import DistrictsPage from '../DistrictsPage'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'

// Full-page axe scan: mounting DistrictsPage + walking every node for
// WCAG violations is the test's scope. Under coverage worker contention
// this routinely runs 6-8s. 15s ceiling recognises that category —
// same honest categorization as the journey tests (#473).
vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)

// #2405 — the landing page's CDN reads, stubbed so no request leaves the
// test: the dates index, the latest-date manifest and the undated rankings.
// The rankings are empty, so the scan covers the page's empty-table state.
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-10-15'],
    count: 1,
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-10-15',
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-10-15',
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  // The dated read the page switches to once the dates index resolves.
  fetchCdnRankingsForDate: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-10-15',
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  // Not published for this date: each read's own null (404) result.
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchCdnRegionRollups: vi.fn().mockResolvedValue(null),
  fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
}))

const queryClient = new QueryClient()

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
})

describe('DistrictsPage Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ProgramYearProvider>
          <MemoryRouter>
            <DistrictsPage />
          </MemoryRouter>
        </ProgramYearProvider>
      </QueryClientProvider>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
