/**
 * Every Recharts chart whose values exist only in its hover tooltip carries
 * the tap-to-pin readout on devices without hover (#1835).
 *
 * YearOverYearComparison is deliberately absent: its bar values are already
 * printed in the comparison cards beside the bars, so nothing depends on
 * hover there.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TOUCH_QUERY } from '../ChartReadout'
import { MembershipTrendChart } from '../../MembershipTrendChart'
import { MembershipPaymentsChart } from '../../MembershipPaymentsChart'
import HistoricalRankChart from '../../HistoricalRankChart'
import FullYearRankingChart from '../../FullYearRankingChart'
import { RaceChart } from '../../clubs/RaceChart'
import type { RankHistoryResponse } from '../../../types/districts'

function stubHover(canHover: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === TOUCH_QUERY ? !canHover : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const RANK_HISTORY: RankHistoryResponse = {
  districtId: '61',
  districtName: 'District 61',
  history: [
    {
      date: '2026-08-15',
      aggregateScore: 150,
      clubsRank: 15,
      paymentsRank: 20,
      distinguishedRank: 10,
      totalDistricts: 120,
      overallRank: 50,
    },
    {
      date: '2026-09-15',
      aggregateScore: 140,
      clubsRank: 12,
      paymentsRank: 18,
      distinguishedRank: 8,
      totalDistricts: 120,
      overallRank: 40,
    },
  ],
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
}

const CHARTS: Array<[string, () => React.ReactElement]> = [
  [
    'MembershipTrendChart',
    () => (
      <MembershipTrendChart
        membershipTrend={[
          { date: '2026-08-01', count: 3000 },
          { date: '2026-09-01', count: 3100 },
          { date: '2026-10-01', count: 3200 },
        ]}
      />
    ),
  ],
  [
    'MembershipPaymentsChart',
    () => (
      <MembershipPaymentsChart
        paymentsTrend={[
          { date: '2026-08-01', payments: 1000, programYearDay: 31 },
          { date: '2026-09-01', payments: 1500, programYearDay: 62 },
        ]}
        statistics={{
          currentPayments: 1500,
          paymentBase: 1400,
          yearOverYearChange: 100,
          trendDirection: 'up',
          yearOverYearUnavailableReason: null,
        }}
      />
    ),
  ],
  [
    'HistoricalRankChart',
    () => (
      <HistoricalRankChart
        data={[RANK_HISTORY]}
        isLoading={false}
        isError={false}
      />
    ),
  ],
  [
    'FullYearRankingChart',
    () => (
      <FullYearRankingChart
        data={RANK_HISTORY}
        selectedMetric="clubs"
        onMetricChange={vi.fn()}
        isLoading={false}
        programYear={{
          year: 2026,
          startDate: '2026-07-01',
          endDate: '2027-06-30',
          label: '2026-2027',
        }}
      />
    ),
  ],
  [
    'RaceChart',
    () => (
      <RaceChart
        timeline={[
          {
            date: '2026-08-14',
            Distinguished: 20,
            Select: 4,
            President: 3,
            Smedley: 1,
            official: 0,
          },
          {
            date: '2026-09-12',
            Distinguished: 35,
            Select: 4,
            President: 3,
            Smedley: 0,
            official: 0,
          },
        ]}
        smedleyAvailable
        currentCounts={{
          Distinguished: 31,
          Select: 1,
          President: 3,
          Smedley: 0,
        }}
      />
    ),
  ],
]

describe('readout adoption (#1835)', () => {
  it.each(CHARTS)('%s shows the readout line without hover', (_, ui) => {
    stubHover(false)
    render(ui())
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'Tap the chart to read a value'
    )
  })

  it.each(CHARTS)('%s is unchanged on a hover device', (_, ui) => {
    stubHover(true)
    render(ui())
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})
