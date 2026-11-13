/* Rank lines are drawn on integers (#2659, HUB-27).
   `type="monotone"` is a spline: through integer ranks it draws dips that
   never happened (below the axis floor). A rank line is linear or stepped,
   the Y axis includes rank 1 and counts only whole ranks, and the X axis
   labels months, not 30 rotated dates. */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import FullYearRankingChart from '../FullYearRankingChart'
import type { RankHistoryResponse } from '../../types/districts'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Line: ({ type }: { type?: string }) => (
    <div data-testid="chart-line" data-type={type} />
  ),
  XAxis: ({ ticks }: { ticks?: unknown[] }) => (
    <div data-testid="x-axis" data-ticks={JSON.stringify(ticks ?? null)} />
  ),
  YAxis: ({
    domain,
    allowDecimals,
  }: {
    domain?: unknown[]
    allowDecimals?: boolean
  }) => (
    <div
      data-testid="y-axis"
      data-domain={JSON.stringify(domain)}
      data-allow-decimals={String(allowDecimals)}
    />
  ),
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const point = (date: string, rank: number) => ({
  date,
  aggregateScore: 100,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  totalDistricts: 120,
  overallRank: rank,
})

const DATA: RankHistoryResponse = {
  districtId: '57',
  districtName: 'District 57',
  history: [
    point('2024-07-15', 4),
    point('2024-07-22', 4),
    point('2024-08-20', 3),
    point('2024-08-27', 3),
    point('2024-09-29', 9),
    point('2024-10-05', 2),
    point('2024-10-12', 2),
  ],
}

const PY = {
  year: 2024,
  startDate: '2024-07-01',
  endDate: '2025-06-30',
  label: '2024-2025',
}

describe('FullYearRankingChart rank line (#2659)', () => {
  it('draws the integer ranks with a linear or step line, never monotone', () => {
    render(
      <FullYearRankingChart
        data={DATA}
        selectedMetric="overall"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    const type = screen.getByTestId('chart-line').getAttribute('data-type')
    expect(['linear', 'step', 'stepAfter', 'stepBefore']).toContain(type)
  })

  it('floors the Y axis at rank 1 and counts whole ranks only', () => {
    render(
      <FullYearRankingChart
        data={DATA}
        selectedMetric="overall"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    const y = screen.getByTestId('y-axis')
    expect(JSON.parse(y.getAttribute('data-domain') ?? 'null')[0]).toBe(1)
    expect(y.getAttribute('data-allow-decimals')).toBe('false')
  })

  it('labels months on the X axis, not every snapshot date', () => {
    render(
      <FullYearRankingChart
        data={DATA}
        selectedMetric="overall"
        onMetricChange={() => {}}
        isLoading={false}
        programYear={PY}
      />
    )
    const ticks = JSON.parse(
      screen.getByTestId('x-axis').getAttribute('data-ticks') ?? 'null'
    ) as string[] | null
    // One tick per month: the first snapshot of Jul, Aug, Sep and Oct.
    expect(ticks).toEqual([
      '2024-07-15',
      '2024-08-20',
      '2024-09-29',
      '2024-10-05',
    ])
  })

  it('HistoricalRankChart (the landing rank chart) is not monotone either', () => {
    const source = readFileSync(
      join(__dirname, '..', 'HistoricalRankChart.tsx'),
      'utf8'
    )
    expect(source).not.toMatch(/type="monotone"/)
  })
})
