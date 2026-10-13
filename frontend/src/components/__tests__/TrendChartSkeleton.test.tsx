/**
 * TrendChartSkeleton (#1837): a trend chart's loading placeholder takes the
 * chart's LOADED shape — the `.chart-spark` trigger below 768, the panel
 * (stat tiles + plot) above — so nothing below it moves when the chart lands.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TrendChartSkeleton } from '../TrendChartSkeleton'
import { TOUCH_QUERY } from '../charts/ChartReadout'

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
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

describe('TrendChartSkeleton (#1837)', () => {
  it('takes the panel shape at desktop widths: stat tiles + the plot', () => {
    stubMobile(false)
    const { container } = render(
      <TrendChartSkeleton label="membership trend" statTiles={4} />
    )
    const status = screen.getByRole('status', {
      name: 'Loading membership trend',
    })
    expect(status).toHaveClass('redesign-panel')
    expect(container.querySelectorAll('.grid > div')).toHaveLength(4)
    expect(container.querySelector('.chart-skeleton')).toHaveStyle({
      height: '400px',
    })
  })

  it('takes the collapsed sparkline-trigger shape below 768', () => {
    stubMobile(true)
    const { container } = render(
      <TrendChartSkeleton label="membership trend" statTiles={4} />
    )
    expect(
      screen.getByRole('status', { name: 'Loading membership trend' })
    ).toHaveClass('chart-spark')
    expect(container.querySelector('.chart-spark__trigger')).not.toBeNull()
    expect(container.querySelector('.chart-skeleton')).toBeNull()
  })

  it('keeps the panel shape on phones when forced (expand-sheet fallback)', () => {
    stubMobile(true)
    render(
      <TrendChartSkeleton label="payments trend" statTiles={3} shape="panel" />
    )
    expect(
      screen.getByRole('status', { name: 'Loading payments trend' })
    ).toHaveClass('redesign-panel')
  })

  it('reserves the tap-to-pin readout line on a device without hover (#1835)', () => {
    // A tablet: wide enough for the panel, but it cannot hover, so the loaded
    // chart carries the readout line under the plot — the skeleton must too.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === TOUCH_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
    const { container } = render(
      <TrendChartSkeleton label="membership trend" />
    )
    expect(container.querySelector('.chart-readout')).toBeInTheDocument()
  })

  it('reserves no readout line on a hover device', () => {
    stubMobile(false)
    const { container } = render(
      <TrendChartSkeleton label="membership trend" />
    )
    expect(container.querySelector('.chart-readout')).toBeNull()
  })
})
