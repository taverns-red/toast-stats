/* /awards — President's Membership Retention Award estimate (#1614).
   The card shows when competitive-awards.json carries the key, and is left
   out for older files that predate it (like the other optional sections). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter>
          <AwardsPage />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

const TITLE = /President.s Membership Retention Award/

describe('AwardsPage — membership retention estimate (#1614)', () => {
  beforeEach(() => {
    mockStandings = base
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
})
