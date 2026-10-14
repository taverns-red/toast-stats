/**
 * Skeleton height = chart height (#1835 AC; Lesson 158 — reserve with the
 * loaded structure, not a measured height).
 *
 * A chart's loading state takes the loaded panel's shape: the same heading
 * and controls, the legend-chip row (#1835 moved the legend out of the plot
 * into a 44 px chip row), a plot placeholder of the plot's own height and,
 * without hover, the readout line. The rank charts' loading states drew a
 * 320 px placeholder (h-80) under a bare heading against a 400 px plot.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TrendChartSkeleton } from '../../TrendChartSkeleton'
import HistoricalRankChart from '../../HistoricalRankChart'
import FullYearRankingChart from '../../FullYearRankingChart'
import { TOUCH_QUERY } from '../ChartReadout'

function stubMedia(touch: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === TOUCH_QUERY ? touch : false,
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

const plotHeight = (root: HTMLElement) =>
  (root.querySelector('.chart-skeleton') as HTMLElement | null)?.style.height

describe('trend chart skeleton reserves the legend-chip row (#1835)', () => {
  it('panel shape: a chip row between the stat tiles and the plot', () => {
    stubMedia(false)
    const { container } = render(
      <TrendChartSkeleton label="membership trend" statTiles={4} legend />
    )
    const chips = container.querySelector('.chart-legend-chips')
    expect(chips).not.toBeNull()
    expect(chips!.querySelector('.chart-legend-chip')).not.toBeNull()
    // Chips sit above the plot, as in the loaded chart.
    const plot = container.querySelector('.chart-skeleton')!
    expect(
      chips!.compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})

describe('rank chart loading states take the loaded shape (#1835)', () => {
  it('HistoricalRankChart: heading, metric toggles, chip row, 400 px plot', () => {
    stubMedia(false)
    const { container } = render(
      <HistoricalRankChart data={[]} isLoading isError={false} />
    )
    const panel = screen.getByRole('region', {
      name: 'Loading historical rank data',
    })
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('heading', { name: 'Historical Rank Progression' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overall Score' })).toBeDisabled()
    expect(container.querySelector('.chart-legend-chips')).not.toBeNull()
    expect(plotHeight(container)).toBe('400px')
    expect(screen.queryByTestId('chart-readout-reserve')).toBeNull()
  })

  it('HistoricalRankChart without hover also reserves the readout line', () => {
    stubMedia(true)
    render(<HistoricalRankChart data={[]} isLoading isError={false} />)
    expect(screen.getByTestId('chart-readout-reserve')).toHaveClass(
      'chart-readout'
    )
  })

  it('FullYearRankingChart: heading, program year, toggles, 400 px plot', () => {
    stubMedia(true)
    const { container } = render(
      <FullYearRankingChart
        data={null}
        selectedMetric="clubs"
        onMetricChange={vi.fn()}
        isLoading
        programYear={{
          year: 2026,
          startDate: '2026-07-01',
          endDate: '2027-06-30',
          label: '2026-2027',
        }}
      />
    )
    expect(
      screen.getByLabelText('Loading ranking progression chart')
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/Program Year: 2026-2027/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: false }).length).toBe(3)
    expect(plotHeight(container)).toBe('400px')
    expect(screen.getByTestId('chart-readout-reserve')).toBeInTheDocument()
  })
})
