/* Growth/decline periods are labelled (#2659, HUB-26).
   Two 30%-opacity reference lines per period (about 20 on a busy year) with
   no key left colour as the only cue. A period is one shaded band, and the
   legend chip beneath the chart carries the same colour and the word. */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MembershipTrendChart } from '../MembershipTrendChart'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ReferenceLine: () => <div data-testid="reference-line" />,
  ReferenceArea: ({ fill }: { fill?: string }) => (
    <div data-testid="reference-area" data-fill={fill} />
  ),
}))

// Four rising snapshots: one growth period.
const RISING = [
  { date: '2026-07-26', count: 2900 },
  { date: '2026-08-31', count: 2920 },
  { date: '2026-09-20', count: 2950 },
  { date: '2026-10-11', count: 3012 },
]

describe('MembershipTrendChart periods (#2659)', () => {
  it('shades each period as one band, with no bare unlabelled lines', () => {
    render(
      <MembershipTrendChart membershipTrend={RISING} programYear="2026-2027" />
    )
    expect(screen.queryAllByTestId('reference-line')).toHaveLength(0)
    expect(screen.getAllByTestId('reference-area')).toHaveLength(1)
  })

  it('names the band in a legend chip that shares its colour', () => {
    render(
      <MembershipTrendChart membershipTrend={RISING} programYear="2026-2027" />
    )
    const chip = screen.getByText('Growth period')
    const swatch = chip.previousElementSibling as HTMLElement
    const band = screen.getByTestId('reference-area')
    expect(swatch.style.background).toBe(band.getAttribute('data-fill'))
  })
})
