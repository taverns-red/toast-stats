/* /awards — honest ties on Top-3 awards (#1610).
   TI names exactly three winners but does not publish its tie-break. When
   districts tie, they keep a shared rank and are labelled as tied co-winners;
   no secondary sort key is invented. */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type {
  CompetitiveAwardRanking,
  CompetitiveAwardStandings,
} from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  // Club Growth recipients (#1537) read the snapshot index + checkpoint files.
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankingsForDateExact: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
}))

const row = (
  districtId: string,
  rank: number,
  value: number,
  isWinner: boolean
): CompetitiveAwardRanking => ({
  districtId,
  districtName: `District ${districtId}`,
  region: '1',
  rank,
  value,
  isWinner,
})

// 2025-26 live shape: five districts share rank 1 at 100% retention.
const mockStandings: CompetitiveAwardStandings = {
  metadata: {
    snapshotId: '2026-06-30',
    calculatedAt: '2026-09-10T00:00:00.000Z',
    totalDistricts: 128,
  },
  extensionAward: [
    row('109', 1, 16, true),
    row('94', 2, 15, true),
    row('89', 3, 12, true),
    row('116', 4, 10, false),
  ],
  twentyPlusAward: [],
  retentionAward: [
    row('93', 1, 100, true),
    row('49', 1, 100, true),
    row('104', 1, 100, true),
    row('17', 1, 100, true),
    row('73', 1, 100, true),
    row('110', 6, 98.61, false),
  ],
  byDistrict: {},
}

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: () => ({
    data: mockStandings,
    isLoading: false,
    isError: false,
  }),
}))

import AwardsPage from '../AwardsPage'

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter>
          <AwardsPage />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const card = (name: RegExp) => {
  const heading = screen.getByRole('heading', { name })
  return heading.closest('section') as HTMLElement
}

describe('AwardsPage — Top-3 ties (#1610)', () => {
  it('labels each tied co-winner as tied, keeping the shared rank', () => {
    renderPage()
    const retention = card(/club retention award/i)
    const rows = within(retention).getAllByRole('listitem')
    const tied = rows.filter(r => within(r).queryByText(/^tied$/i))
    expect(tied).toHaveLength(5)
    for (const r of tied) {
      expect(within(r).getByText('#1')).toBeInTheDocument()
    }
    // The non-winner below the tie is not labelled
    const d110 = rows.find(r => within(r).queryByText('District 110'))!
    expect(within(d110).queryByText(/^tied$/i)).not.toBeInTheDocument()
  })

  it("says TI's tie-break isn't published on a card with tied winners", () => {
    renderPage()
    const retention = card(/club retention award/i)
    expect(
      within(retention).getByText(/tie-break isn.t published/i)
    ).toBeInTheDocument()
  })

  it('shows no tie label or note when winners are untied', () => {
    renderPage()
    const extension = card(/extension award/i)
    expect(within(extension).queryByText(/^tied$/i)).not.toBeInTheDocument()
    expect(within(extension).queryByText(/tie-break/i)).not.toBeInTheDocument()
  })
})
