import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import HistoricalRankChart from '../../HistoricalRankChart'
import FullYearRankingChart from '../../FullYearRankingChart'
import { YearOverYearComparison } from '../../YearOverYearComparison'
import {
  HistoricalRankChartFallback,
  HistoricalRankChartSkeleton,
} from '../../HistoricalRankChartSkeleton'
import {
  FullYearRankingChartFallback,
  FullYearRankingChartSkeleton,
} from '../../FullYearRankingChartSkeleton'
import {
  YearOverYearComparisonFallback,
  YearOverYearComparisonSkeleton,
} from '../../YearOverYearComparisonSkeleton'
import type { RankHistoryResponse } from '../../../types/districts'

/* #1835: a lazy chart's chunk fallback paints what the chart itself will
 * paint before its plot: the loading panel, and also its empty or error
 * state. On the landing page the rank chart opens with no regions picked,
 * so it lands as the 400 px empty state; a 630 px loading panel there would
 * shrink by 230 px when the chunk arrives. With data, the fallback is the
 * loading panel, the loaded chart's shape. */

const PY = {
  year: 2026,
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  label: '2026-2027',
}

const html = (ui: React.ReactElement) => {
  const { container } = render(ui)
  const out = container.innerHTML
  cleanup()
  return out
}

afterEach(() => cleanup())

describe('HistoricalRankChartFallback (#1835)', () => {
  const base = { isLoading: false, isError: false, selectedProgramYear: PY }

  it('no districts selected: the empty state', () => {
    const props = { ...base, data: [] }
    expect(html(<HistoricalRankChartFallback {...props} />)).toBe(
      html(<HistoricalRankChart {...props} />)
    )
  })

  it('a failed query: the error state', () => {
    const props = {
      ...base,
      data: [],
      isError: true,
      error: new Error('boom'),
    }
    expect(html(<HistoricalRankChartFallback {...props} />)).toBe(
      html(<HistoricalRankChart {...props} />)
    )
  })

  it('loading or with data: the loading panel', () => {
    const skeleton = html(<HistoricalRankChartSkeleton programYear={PY} />)
    const data = [{ districtId: '61' }] as unknown as RankHistoryResponse[]
    expect(html(<HistoricalRankChartFallback {...base} data={data} />)).toBe(
      skeleton
    )
    expect(
      html(<HistoricalRankChartFallback {...base} data={[]} isLoading />)
    ).toBe(skeleton)
  })
})

describe('FullYearRankingChartFallback (#1835)', () => {
  const base = {
    isLoading: false,
    programYear: PY,
    selectedMetric: 'clubs' as const,
    onMetricChange: () => {},
  }

  it('no data: the empty state', () => {
    expect(html(<FullYearRankingChartFallback {...base} data={null} />)).toBe(
      html(<FullYearRankingChart {...base} data={null} />)
    )
  })

  it('with data: the loading panel', () => {
    const data = { history: [{ date: '2026-08-01' }] }
    expect(html(<FullYearRankingChartFallback {...base} data={data} />)).toBe(
      html(<FullYearRankingChartSkeleton {...base} />)
    )
  })
})

describe('YearOverYearComparisonFallback (#1835)', () => {
  const currentYear = {
    totalMembership: 1000,
    distinguishedClubs: 10,
    thrivingClubs: 5,
    totalClubs: 20,
  }

  it.each([
    ['an unavailable reason', { unavailableReason: 'Districts differ' }],
    ['no prior year', {}],
    [
      'all-zero changes',
      {
        yearOverYear: {
          membershipChange: 0,
          distinguishedChange: 0,
          clubHealthChange: 0,
        },
      },
    ],
  ])('%s: the same empty state as the panel', (_, props) => {
    expect(html(<YearOverYearComparisonFallback {...props} />)).toBe(
      html(<YearOverYearComparison currentYear={currentYear} {...props} />)
    )
  })

  it('loading or with a comparison: the panel skeleton', () => {
    const skeleton = html(<YearOverYearComparisonSkeleton />)
    expect(html(<YearOverYearComparisonFallback isLoading />)).toBe(skeleton)
    expect(
      html(
        <YearOverYearComparisonFallback
          yearOverYear={{
            membershipChange: 5,
            distinguishedChange: -2,
            clubHealthChange: 1,
          }}
        />
      )
    ).toBe(skeleton)
  })
})
