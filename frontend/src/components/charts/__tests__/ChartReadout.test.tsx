/**
 * Tap-to-pin chart readout (#1835, mobile epic #1827 Phase 1 item 13).
 *
 * On a device that cannot hover (`(hover: none)` — phones, tablets) a Recharts
 * tooltip never opens from a tap: the mobile review found
 * `.recharts-tooltip-wrapper` stayed `visibility: hidden` after a tap on the
 * Trends chart. The shared readout primitive switches the chart's Tooltip to
 * `trigger="click"`, drops the floating box, and renders a persistent value
 * line under the chart instead — driven by the same active-point state, so a
 * tap AND the keyboard (Recharts' accessibility layer: arrow keys) both pin a
 * value. On hover-capable devices the chart is untouched.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { useChartReadout, ChartReadout, TOUCH_QUERY } from '../ChartReadout'

const DATA = [
  { date: '2026-08-01', members: 100, prior: 90 },
  { date: '2026-09-01', members: 120, prior: 95 },
  { date: '2026-10-01', members: 130, prior: 99 },
]

function stubHover(canHover: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === TOUCH_QUERY ? !canHover : false,
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

function Harness() {
  const readout = useChartReadout()
  return (
    <div>
      <LineChart width={400} height={200} data={DATA}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip {...readout.tooltipProps} />
        <Line
          dataKey="members"
          name="Members"
          stroke="#123456"
          isAnimationActive={false}
        />
        <Line
          dataKey="prior"
          name="Last year"
          stroke="#654321"
          isAnimationActive={false}
        />
      </LineChart>
      <ChartReadout
        readout={readout}
        labelFormatter={l => `Snapshot ${l}`}
        valueFormatter={v => Number(v).toLocaleString('en-US')}
      />
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const settle = () => act(async () => new Promise(r => setTimeout(r, 30)))

describe('ChartReadout on a device without hover (#1835)', () => {
  it('reserves the readout line with a hint before any tap', () => {
    stubHover(false)
    render(<Harness />)
    const line = screen.getByTestId('chart-readout')
    expect(line).toHaveAttribute('aria-live', 'polite')
    expect(line).toHaveTextContent('Tap the chart to read a value')
  })

  it('a tap pins the nearest point: label plus every series value', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.recharts-wrapper')!
    await act(async () => {
      fireEvent.click(wrapper, { clientX: 395, clientY: 100 })
    })
    await settle()
    const line = screen.getByTestId('chart-readout')
    expect(line).toHaveTextContent('Snapshot 2026-10-01')
    expect(line).toHaveTextContent('Members 130')
    expect(line).toHaveTextContent('Last year 99')
    // Text wears ink; the series colour is only the swatch.
    const swatches = line.querySelectorAll('.chart-readout__swatch')
    expect(swatches).toHaveLength(2)
    expect(swatches[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('the keyboard moves the pinned value (no pointer needed)', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const surface = container.querySelector('svg.recharts-surface')!
    await act(async () => {
      ;(surface as unknown as HTMLElement).focus()
      fireEvent.keyDown(surface, { key: 'ArrowRight' })
    })
    await settle()
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/Members \d+/)
  })

  it('never paints the floating tooltip box', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    await act(async () => {
      fireEvent.click(container.querySelector('.recharts-wrapper')!, {
        clientX: 395,
        clientY: 100,
      })
    })
    await settle()
    expect(container.querySelector('.recharts-default-tooltip')).toBeNull()
  })
})

describe('ChartReadout on a hover-capable device', () => {
  it('renders no readout line and leaves the tooltip on hover', () => {
    stubHover(true)
    render(<Harness />)
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})
