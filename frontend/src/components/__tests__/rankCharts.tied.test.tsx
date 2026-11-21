/* Rank charts on tied dates (#3145). A tie across every district makes each
   district rank 1, so the line leaves a gap there instead of plotting rank 1,
   and the tooltip says "Tied". Old files without tie flags plot as before. */

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import FullYearRankingChart from '../FullYearRankingChart'
import HistoricalRankChart from '../HistoricalRankChart'
import type {
  HistoricalRankPoint,
  RankHistoryResponse,
} from '../../types/districts'

const tooltip = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
}))

vi.mock('recharts', () => ({
  LineChart: ({
    children,
    data,
  }: {
    children: React.ReactNode
    data: unknown[]
  }) => (
    <div data-testid="line-chart" data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ content }: { content: React.ReactElement }) =>
    tooltip.props
      ? React.cloneElement(content, tooltip.props as Record<string, unknown>)
      : null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const point = (
  date: string,
  rank: number,
  extra: Partial<HistoricalRankPoint> = {}
): HistoricalRankPoint => ({
  date,
  aggregateScore: 100,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  overallRank: rank,
  totalDistricts: 94,
  ...extra,
})

const ALL_TIED = {
  clubsTied: true,
  paymentsTied: true,
  distinguishedTied: true,
} as const

const history = (
  districtId: string,
  points: HistoricalRankPoint[]
): RankHistoryResponse => ({
  districtId,
  districtName: `District ${districtId}`,
  history: points,
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
})

const PY = {
  year: 2026,
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  label: '2026-2027',
}

const plotted = (): Array<Record<string, unknown>> =>
  JSON.parse(
    screen.getByTestId('line-chart').getAttribute('data-points') ?? '[]'
  )

afterEach(() => {
  tooltip.props = null
  cleanup()
})

describe('FullYearRankingChart on tied dates (#3145)', () => {
  const data = history('61', [
    point('2026-07-15', 1, ALL_TIED),
    point('2026-07-22', 6),
    point('2026-07-29', 4),
  ])

  it('leaves a gap on a tied date instead of plotting rank 1', () => {
    render(
      <FullYearRankingChart
        data={data}
        selectedMetric="distinguished"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    expect(plotted().map(p => p.value)).toEqual([null, 6, 4])
  })

  it('leaves a gap on the Overall line when every category is tied', () => {
    render(
      <FullYearRankingChart
        data={data}
        selectedMetric="aggregate"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    expect(plotted().map(p => p.value)).toEqual([null, 6, 4])
    // The description reads the first and last ranked dates.
    expect(
      screen.getByRole('img', { name: /improved from rank 6 to rank 4/ })
    ).toBeInTheDocument()
  })

  it('says "Tied" in the tooltip on a tied date', () => {
    tooltip.props = {
      active: true,
      label: '2026-07-15',
      payload: [
        {
          dataKey: 'value',
          value: null,
          color: 'blue',
          payload: { date: '2026-07-15', value: null },
        },
      ],
    }
    render(
      <FullYearRankingChart
        data={data}
        selectedMetric="distinguished"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Distinguished: Tied')
  })

  it('plots an old file without tie flags as before', () => {
    render(
      <FullYearRankingChart
        data={history('61', [point('2026-07-15', 1), point('2026-07-22', 6)])}
        selectedMetric="distinguished"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    expect(plotted().map(p => p.value)).toEqual([1, 6])
  })
})

describe('HistoricalRankChart on tied dates (#3145)', () => {
  const data = [
    history('61', [
      point('2026-07-15', 1, { distinguishedTied: true }),
      point('2026-07-22', 6),
    ]),
    history('49', [
      point('2026-07-15', 1, { distinguishedTied: true }),
      point('2026-07-22', 3),
    ]),
  ]

  it('leaves a gap for every district on a tied date', () => {
    render(
      <HistoricalRankChart data={data} isLoading={false} isError={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Distinguished' }))

    const [tied, ranked] = plotted()
    expect(tied?.['61']).toBeNull()
    expect(tied?.['49']).toBeNull()
    expect(ranked?.['61']).toBe(6)
    expect(ranked?.['49']).toBe(3)
  })

  it('still plots a category that is not tied on that date', () => {
    render(
      <HistoricalRankChart data={data} isLoading={false} isError={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Paid Clubs' }))

    expect(plotted()[0]?.['61']).toBe(1)
  })

  it('says "Tied" for each district in the tooltip on a tied date', () => {
    tooltip.props = {
      active: true,
      payload: [
        {
          dataKey: '61',
          value: null,
          color: 'blue',
          payload: { date: '2026-07-15' },
        },
        {
          dataKey: '49',
          value: null,
          color: 'red',
          payload: { date: '2026-07-15' },
        },
      ],
    }
    render(
      <HistoricalRankChart data={data} isLoading={false} isError={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Distinguished' }))

    const lines = screen
      .getAllByText((_, el) => el?.tagName === 'P')
      .map(el => el.textContent)
    expect(lines).toContain('District 61: Tied')
    expect(lines).toContain('District 49: Tied')
  })
})
