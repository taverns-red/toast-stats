/**
 * #1791 — the club page's membership trend with prior program years faint
 * behind the current line, built on #1705's shared program-year-position
 * helper (`buildMembershipTrendChartData`): every series is placed by its
 * program-year day, and the current line is anchored at day 0 on the
 * predecessor's 06-30 close (D15). Tap-to-pin: a persistent readout under
 * the chart names the pinned day's value for each year (no hover-only
 * tooltip); arrow keys move the pin.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ClubMembershipTrendChart } from '../ClubMembershipTrendChart'

afterEach(() => cleanup())

const CURRENT = [
  { date: '2026-07-26', count: 16 },
  { date: '2026-08-31', count: 14 },
  { date: '2026-10-11', count: 10 },
]
const PRIORS = [
  {
    label: '2025-2026',
    data: [
      { date: '2025-07-01', count: 18 },
      { date: '2026-06-30', count: 16 },
    ],
  },
  {
    label: '2024-2025',
    data: [
      { date: '2024-07-01', count: 22 },
      { date: '2025-06-30', count: 18 },
    ],
  },
]

const renderChart = (
  props: Partial<Parameters<typeof ClubMembershipTrendChart>[0]> = {}
) =>
  render(
    <ClubMembershipTrendChart
      current={CURRENT}
      priors={PRIORS}
      programYearLabel="2026-2027"
      {...props}
    />
  )

const pointsOf = (el: Element) =>
  (el.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map(p => p.split(',').map(Number) as [number, number])

describe('ClubMembershipTrendChart', () => {
  it('draws the current year solid and each prior year as a faint line', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('polyline.line')).toHaveLength(1)
    expect(container.querySelectorAll('polyline.line--prior')).toHaveLength(2)
  })

  it('anchors the current line at day 0 on the predecessor 06-30 close (D15)', () => {
    const { container } = renderChart()
    const current = pointsOf(container.querySelector('polyline.line')!)
    const prior = pointsOf(
      container.querySelector('polyline.line--prior[data-year="2025-2026"]')!
    )
    // Same x as the predecessor's July 1 start, same y as its June 30 close.
    expect(current[0]![0]).toBeCloseTo(prior[0]![0], 1)
    expect(current[0]![1]).toBeCloseTo(prior[1]![1], 1)
    // The anchor is a plotted point, not a data dot.
    expect(container.querySelectorAll('circle.dot')).toHaveLength(3)
  })

  it('places every year by program-year position (Jul 1 at the same x)', () => {
    const { container } = renderChart()
    const xs = [...container.querySelectorAll('polyline.line--prior')].map(
      el => pointsOf(el)[0]![0]
    )
    expect(xs[0]).toBeCloseTo(xs[1]!, 1)
  })

  it('labels the years in a legend that does not rely on colour', () => {
    renderChart()
    const legend = screen.getByRole('list', { name: 'Program years' })
    expect(legend).toHaveTextContent('2026–27')
    expect(legend).toHaveTextContent('2025–26')
    expect(legend).toHaveTextContent('2024–25')
  })

  it('pins the latest point by default and reads every year at that day', () => {
    renderChart()
    const readout = screen.getByTestId('club-trend-readout')
    expect(readout).toHaveTextContent('Oct 11')
    expect(readout).toHaveTextContent('2026–27: 10')
  })

  it('moves the pin with the arrow keys', () => {
    renderChart()
    const chart = screen.getByRole('img', { name: /Membership trend/ })
    fireEvent.keyDown(chart.closest('[tabindex]')!, { key: 'ArrowLeft' })
    expect(screen.getByTestId('club-trend-readout')).toHaveTextContent(
      '2026–27: 14'
    )
  })

  it('keeps a flat series off the axes (symmetric padding, no NaN)', () => {
    const { container } = renderChart({
      current: [
        { date: '2026-08-31', count: 12 },
        { date: '2026-10-11', count: 12 },
      ],
      priors: [],
    })
    const pts = pointsOf(container.querySelector('polyline.line')!)
    for (const [x, y] of pts) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
    // Flat → drawn mid-plot, not on the top or bottom edge.
    expect(pts[0]![1]).toBeGreaterThan(20)
    expect(pts[0]![1]).toBeLessThan(240)
  })

  it('renders without prior years (history unavailable)', () => {
    const { container } = renderChart({ priors: [] })
    expect(container.querySelectorAll('polyline.line--prior')).toHaveLength(0)
    expect(container.querySelector('polyline.line')).not.toBeNull()
  })
})
