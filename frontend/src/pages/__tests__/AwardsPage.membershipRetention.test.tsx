/* /awards — President's Membership Retention Award estimate (#1614).
   The card shows when competitive-awards.json carries the key, and is left
   out for older files that predate it (like the other optional sections). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type { CompetitiveAwardStandings } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankingsForDateExact: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
}))

const base: CompetitiveAwardStandings = {
  metadata: {
    snapshotId: '2026-06-30',
    calculatedAt: '2026-07-25T00:00:00.000Z',
    totalDistricts: 128,
  },
  extensionAward: [],
  twentyPlusAward: [],
  retentionAward: [],
  byDistrict: {},
}

let mockStandings: CompetitiveAwardStandings = base

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: () => ({
    data: mockStandings,
    isLoading: false,
    isError: false,
  }),
}))

import AwardsPage from '../AwardsPage'
import { fetchCdnDates } from '../../services/cdn'

const renderPage = (url = '/') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <AwardsPage />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

const TITLE = /President.s Membership Retention Award/

describe('AwardsPage — membership retention estimate (#1614)', () => {
  beforeEach(() => {
    mockStandings = base
    vi.mocked(fetchCdnDates).mockResolvedValue({ dates: [], count: 0 })
  })

  it('shows the card when the file has the award', () => {
    mockStandings = {
      ...base,
      membershipRetentionAward: {
        status: 'final',
        baselineDate: '2026-03-31',
        standings: [
          {
            districtId: '64',
            districtName: '64',
            region: '7',
            rank: 1,
            value: 83.66,
            isWinner: true,
            retained: 727,
            base: 869,
          },
        ],
      },
    }
    renderPage()
    expect(
      screen.getByRole('heading', { level: 2, name: TITLE })
    ).toBeInTheDocument()
    // The percentage and "(727 of 869)" are separate spans in one cell.
    expect(screen.getByTestId('membership-retention-card').textContent).toMatch(
      /83\.7% \(727 of 869\)/
    )
  })

  it('leaves the card out for an older file without the award', () => {
    renderPage()
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull()
    // The other leaderboards still render.
    expect(
      screen.getByRole('heading', { name: /President.s Extension Award/ })
    ).toBeInTheDocument()
  })

  describe('a year whose last snapshot is not June 30 (#3075)', () => {
    const inProgress: CompetitiveAwardStandings = {
      ...base,
      membershipRetentionAward: {
        status: 'in-progress',
        baselineDate: '2025-03-31',
        standings: [
          {
            districtId: '64',
            districtName: '64',
            region: '7',
            rank: 1,
            value: 83.66,
            isWinner: true,
            retained: 727,
            base: 869,
          },
        ],
      },
    }
    const card = () => screen.getByTestId('membership-retention-card')

    it('shows a past year as final, not "so far"', async () => {
      vi.mocked(fetchCdnDates).mockResolvedValue({
        dates: ['2025-04-30', '2025-06-27', '2026-07-31'],
        count: 3,
      })
      mockStandings = inProgress
      renderPage('/?py=2024')
      await waitFor(() => expect(card().textContent).toMatch(/winner/))
      expect(card().textContent).not.toMatch(/so far/)
    })

    it('still shows the newest year as "so far" before June 30', async () => {
      vi.mocked(fetchCdnDates).mockResolvedValue({
        dates: ['2026-04-30', '2026-06-27'],
        count: 2,
      })
      mockStandings = inProgress
      renderPage('/?py=2025')
      await waitFor(() => expect(card().textContent).toMatch(/top 3 so far/))
      expect(card().textContent).toMatch(/Standings so far/)
    })
  })
})
