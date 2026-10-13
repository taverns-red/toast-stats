/* MembershipTrendChart — whole program year against prior years (#1705).
   Mounts the chart component only (Lesson 51). jsdom has no layout, so the
   Recharts SVG is not asserted here; the builder's own tests cover the
   geometry. These cover what the component derives from it. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MembershipTrendChart } from '../MembershipTrendChart'

const CURRENT = [
  { date: '2026-07-26', count: 2937 },
  { date: '2026-08-31', count: 2950 },
  { date: '2026-10-11', count: 3012 },
]
// A prior year with a much higher peak and a 06-30 close below the current
// start: neither may leak into the current-year statistics.
const PRIOR = {
  label: '2025-2026',
  data: [
    { date: '2025-07-31', count: 9000 },
    { date: '2026-06-30', count: 2892 },
  ],
}

function renderChart() {
  return render(
    <MembershipTrendChart
      membershipTrend={CURRENT}
      priorYearTrends={[PRIOR]}
      programYear="2026-2027"
    />
  )
}

describe('MembershipTrendChart — full program year (#1705)', () => {
  it('statistics use current-year points only (not the prior year, not the D15 anchor)', () => {
    renderChart()
    const statValue = (label: string) =>
      screen.getByText(label).nextElementSibling?.textContent
    expect(statValue('Current')).toBe('3,012')
    expect(statValue('Peak')).toBe('3,012')
    expect(statValue('Low')).toBe('2,937')
    // 3012 − 2937, not 3012 − 2892 (the anchor).
    expect(statValue('Net Change')).toBe('+75')
  })

  it('the chart description names the current year and each prior year', () => {
    renderChart()
    const img = screen.getByRole('img')
    const label = img.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/July to June/)
    expect(label).toMatch(/PY 2026–27: 2,937 members on July 26, 2026/)
    expect(label).toMatch(/3,012 on October 11, 2026/)
    expect(label).toMatch(/PY 2025–26 ended at 2,892 members on June 30, 2026/)
  })
})
