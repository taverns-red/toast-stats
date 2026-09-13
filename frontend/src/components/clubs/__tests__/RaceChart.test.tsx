/* #1570 — "The pack" becomes a cumulative STACKED chart: the total still
   rises to the recognised count, and the bands show the tier mix inside it.
   Recharts is mocked (the repo's FullYearRankingChart pattern) so the
   assertions are about the data and the stack, not about SVG geometry. */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { GlobalClubRaceTimelinePoint } from '@taverns-red/shared-contracts'
import type { ClubRaceTierCounts } from '../../../utils/clubRaceCounts'
import { RaceChart } from '../RaceChart'

vi.mock('recharts', () => ({
  AreaChart: ({
    children,
    data,
  }: {
    children: React.ReactNode
    data: unknown
  }) => (
    <div data-testid="area-chart" data-series={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: ({
    dataKey,
    stackId,
    type,
    isAnimationActive,
  }: {
    dataKey: string
    stackId?: string
    type?: string
    isAnimationActive?: boolean
  }) => (
    <div
      data-testid="area"
      data-key={dataKey}
      data-stack={stackId}
      data-type={type}
      data-animated={isAnimationActive ? 'true' : 'false'}
    />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

const timeline: GlobalClubRaceTimelinePoint[] = [
  {
    date: '2026-07-26',
    Distinguished: 1,
    Select: 0,
    President: 0,
    Smedley: 0,
    official: 0,
  },
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
]

const currentCounts: ClubRaceTierCounts = {
  Distinguished: 31,
  Select: 1,
  President: 3,
  Smedley: 0,
}

const series = (): Array<Record<string, number | string>> =>
  JSON.parse(screen.getByTestId('area-chart').getAttribute('data-series') || '')

describe('RaceChart (#1570) — stacked by tier', () => {
  afterEach(cleanup)

  it('renders one stacked area per tier, all sharing a stack', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    const areas = screen.getAllByTestId('area')
    expect(areas.map(a => a.getAttribute('data-key'))).toEqual([
      'Distinguished',
      'Select',
      'President',
      'Smedley',
    ])
    const stacks = new Set(areas.map(a => a.getAttribute('data-stack')))
    expect(stacks.size).toBe(1)
    expect([...stacks][0]).toBeTruthy()
  })

  it('keeps the step shape — a crossing is a step, never an interpolated slope', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    for (const area of screen.getAllByTestId('area')) {
      expect(area).toHaveAttribute('data-type', 'stepAfter')
    }
  })

  it('feeds the chart EXCLUSIVE bands, not the cumulative counts', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    expect(series()[1]).toEqual({
      date: '2026-08-14',
      Distinguished: 16,
      Select: 1,
      President: 2,
      Smedley: 1,
    })
  })

  it('anchors the final point to the tile figures above it', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    const points = series()
    expect(points[points.length - 1]).toEqual({
      date: '2026-09-12',
      ...currentCounts,
    })
  })

  it('omits the Smedley band for a program year without the rung', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable={false}
        currentCounts={currentCounts}
      />
    )
    expect(
      screen.getAllByTestId('area').map(a => a.getAttribute('data-key'))
    ).toEqual(['Distinguished', 'Select', 'President'])
  })

  it('tells the reader the bands stack to one club each', () => {
    render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    expect(screen.getByRole('figure')).toHaveTextContent(/counted once/i)
  })
})
