/* The rank axis starts at rank 1 (#2746). Recharts' default domain starts
   at 0, so a reversed rank axis showed a "0" tick at the top, and there is
   no rank 0. The Overall Score is a score, so it keeps the default. */

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HistoricalRankChart from '../HistoricalRankChart'
import type {
  HistoricalRankPoint,
  RankHistoryResponse,
} from '../../types/districts'

const yAxis = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
}))

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: (props: Record<string, unknown>) => {
    yAxis.props = props
    return null
  },
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const point = (date: string, rank: number): HistoricalRankPoint => ({
  date,
  aggregateScore: 100 + rank,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  overallRank: rank,
  totalDistricts: 94,
})

const data: RankHistoryResponse[] = [
  {
    districtId: '61',
    districtName: 'District 61',
    history: [point('2026-07-15', 2), point('2026-07-22', 6)],
    programYear: {
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      year: '2026-2027',
    },
  },
]

afterEach(() => {
  yAxis.props = null
  cleanup()
})

describe('HistoricalRankChart rank axis (#2746)', () => {
  it.each(['Paid Clubs', 'Total Payments', 'Distinguished'])(
    'starts the %s rank axis at 1, with whole ranks only',
    name => {
      render(
        <HistoricalRankChart data={data} isLoading={false} isError={false} />
      )
      fireEvent.click(screen.getByRole('button', { name }))

      expect(yAxis.props?.reversed).toBe(true)
      expect(yAxis.props?.domain).toEqual([1, 'dataMax'])
      expect(yAxis.props?.allowDecimals).toBe(false)
    }
  )

  it('leaves the Overall Score axis on its default domain', () => {
    render(
      <HistoricalRankChart data={data} isLoading={false} isError={false} />
    )
    expect(yAxis.props?.reversed).toBe(false)
    expect(yAxis.props?.domain).toBeUndefined()
  })
})
