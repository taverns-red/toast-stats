/**
 * DistrictOverview — Payment Composition must follow the selected program year
 * (#1396).
 *
 * The reported symptom: with a PAST program year selected, the card rendered
 * `New 73 · April 587 · October 941 · 1,602 payment events` — byte-identical to
 * the CURRENT year's `v1/rankings.json` row for D61 — while the Distinguished
 * Composition bar beside it was correctly year-scoped. The card is fed by
 * `useDistrictRanking`, which took no date; the parent already has one.
 *
 * The card's own percentages add to 100 whichever year it shows, which is why
 * the failure reads as plausible data rather than an obvious error. So this
 * asserts the numbers, not that the card rendered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistrictOverview } from '../DistrictOverview'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../../services/cdn'
import type { CdnRankingsData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: {
      allClubs: [{ clubId: '1' }, { clubId: '2' }],
      totalMembership: 2000,
      distinguishedClubs: {
        smedley: 1,
        presidents: 2,
        select: 3,
        distinguished: 4,
      },
    },
    isLoading: false,
    error: null,
  })),
}))

const mockedLatest = vi.mocked(fetchCdnRankings)
const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

type Row = CdnRankingsData['rankings'][number] & {
  newPayments: number
  aprilPayments: number
  octoberPayments: number
  latePayments: number
  charterPayments: number
}

function row(
  payments: Pick<
    Row,
    | 'newPayments'
    | 'aprilPayments'
    | 'octoberPayments'
    | 'latePayments'
    | 'charterPayments'
  >
): Row {
  return {
    districtId: '61',
    districtName: 'District 61',
    region: '07',
    paidClubs: 100,
    paidClubBase: 98,
    clubGrowthPercent: 2,
    totalPayments: 3000,
    paymentBase: 2900,
    paymentGrowthPercent: 3,
    activeClubs: 100,
    distinguishedClubs: 30,
    selectDistinguished: 8,
    presidentsDistinguished: 4,
    distinguishedPercent: 30,
    clubsRank: 10,
    paymentsRank: 12,
    distinguishedRank: 14,
    aggregateScore: 400,
    overallRank: 11,
    ...payments,
  }
}

/** The observed current-year row: 73 + 587 + 941 + 1 + 0 = 1602 events. */
const CURRENT: CdnRankingsData = {
  rankings: [
    row({
      newPayments: 73,
      aprilPayments: 587,
      octoberPayments: 941,
      latePayments: 1,
      charterPayments: 0,
    }),
  ],
  asOfDate: '2026-07-31',
  generatedAt: '2026-07-31T00:00:00Z',
}

/** The 2024-2025 year-end row: 40 + 300 + 500 + 2 + 1 = 843 events. */
const PAST: CdnRankingsData = {
  rankings: [
    row({
      newPayments: 40,
      aprilPayments: 300,
      octoberPayments: 500,
      latePayments: 2,
      charterPayments: 1,
    }),
  ],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedLatest.mockResolvedValue(CURRENT)
  mockedForDate.mockImplementation((date: SnapshotDate) =>
    Promise.resolve(date === '2025-06-30' ? PAST : CURRENT)
  )
})
afterEach(() => cleanup())

function renderOverview(
  selectedDate: SnapshotDate,
  programYearStartDate: string
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DistrictOverview
        districtId="61"
        selectedDate={selectedDate}
        programYearStartDate={programYearStartDate}
      />
    </QueryClientProvider>
  )
}

describe('DistrictOverview — Payment Composition year scoping (#1396)', () => {
  it("shows the selected past year's payments, not the current year's", async () => {
    renderOverview(snap('2025-06-30'), '2024-07-01')

    const card = await screen.findByTestId('payment-composition')
    await waitFor(() => expect(card).toHaveTextContent(/843 payment events/))
    // 1,602 is the CURRENT year's total. Its appearance here is the bug.
    expect(card).not.toHaveTextContent(/1,602 payment events/)
    expect(mockedForDate).toHaveBeenCalledWith(snap('2025-06-30'))
  })

  it('still shows the current year on a current-year snapshot (no regression)', async () => {
    renderOverview(snap('2026-07-31'), '2025-07-01')

    const card = await screen.findByTestId('payment-composition')
    await waitFor(() => expect(card).toHaveTextContent(/1,602 payment events/))
  })
})
