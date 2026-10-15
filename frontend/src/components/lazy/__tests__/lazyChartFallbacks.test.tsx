import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LazyHistoricalRankChart } from '../LazyHistoricalRankChart'
import { LazyFullYearRankingChart } from '../LazyFullYearRankingChart'
import { LazyYearOverYearComparison } from '../LazyYearOverYearComparison'
import HistoricalRankChart from '../../HistoricalRankChart'
import FullYearRankingChart from '../../FullYearRankingChart'
import { YearOverYearComparison } from '../../YearOverYearComparison'

/* #1835: a lazy chart's chunk fallback is the chart's own loading state.
 *
 * The rank charts load as `ChartSkeleton height={300}` (and the year-over-year
 * panel as 250) while the chunk downloads, then their loading state is a full
 * panel with a 400 px plot: two shifts before the data even lands. The
 * fallback must be the same markup as the chart's `isLoading` render (the
 * #1926 byte-identical pattern), so the chunk landing moves nothing. */

const PY = {
  year: 2026,
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  label: '2026-2027',
}

/** The first, synchronous render: the lazy chunk has not resolved yet. */
const firstPaint = (ui: React.ReactElement) => {
  const { container } = render(ui)
  const html = container.innerHTML
  cleanup()
  return html
}

const loadingPaint = (ui: React.ReactElement) => {
  const { container } = render(ui)
  return container
}

const setTouch = (touch: boolean) => {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: touch && query === '(hover: none)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  )
}

afterEach(() => {
  cleanup()
  setTouch(false)
})

describe('lazy chart chunk fallbacks (#1835)', () => {
  it('HistoricalRankChart: the fallback is the loading state, readout slot included', () => {
    setTouch(true)
    const props = {
      data: [],
      isLoading: true,
      isError: false,
      selectedProgramYear: PY,
    }
    const fallback = firstPaint(<LazyHistoricalRankChart {...props} />)
    const loading = loadingPaint(<HistoricalRankChart {...props} />)

    expect(fallback).toBe(loading.innerHTML)
    expect(
      loading.querySelector('[data-testid="chart-readout-reserve"]')
    ).not.toBeNull()
  })

  it('FullYearRankingChart: the fallback is the loading state', () => {
    const props = {
      data: null,
      selectedMetric: 'aggregate' as const,
      onMetricChange: () => {},
      isLoading: true,
      programYear: PY,
    }
    const fallback = firstPaint(<LazyFullYearRankingChart {...props} />)
    const loading = loadingPaint(<FullYearRankingChart {...props} />)

    expect(fallback).toBe(loading.innerHTML)
  })

  it('YearOverYearComparison: the fallback is the loading state', () => {
    const props = {
      currentYear: {
        totalMembership: 1000,
        distinguishedClubs: 10,
        thrivingClubs: 5,
        totalClubs: 20,
      },
      isLoading: true,
    }
    const fallback = firstPaint(<LazyYearOverYearComparison {...props} />)
    const loading = loadingPaint(<YearOverYearComparison {...props} />)

    expect(fallback).toBe(loading.innerHTML)
  })

  it('YearOverYearComparison: the loading state is the loaded panel, three 200 px plots', () => {
    const loading = loadingPaint(
      <YearOverYearComparison
        currentYear={{
          totalMembership: 1000,
          distinguishedClubs: 10,
          thrivingClubs: 5,
          totalClubs: 20,
        }}
        isLoading
      />
    )
    const panel = loading.querySelector('.redesign-panel')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('aria-busy')).toBe('true')
    expect(loading.textContent).toContain('Year-Over-Year Comparison')
    const plots = loading.querySelectorAll<HTMLElement>('.chart-skeleton')
    expect(plots).toHaveLength(3)
    plots.forEach(p => expect(p.style.height).toBe('200px'))
  })
})
