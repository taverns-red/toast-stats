/**
 * Tap-to-pin chart readout (#1835, mobile epic #1827 Phase 1 item 13).
 *
 * On a device that cannot hover (`(hover: none)` — phones, tablets) a Recharts
 * tooltip never opens from a tap: the mobile review found
 * `.recharts-tooltip-wrapper` stayed `visibility: hidden` after a tap on the
 * Trends chart. The shared readout primitive drops the floating box and
 * renders a persistent value line under the chart instead — driven by the
 * chart's active-point state, so a tap AND the keyboard (Recharts'
 * accessibility layer: arrow keys) both pin a value. On hover-capable
 * devices the chart is untouched.
 *
 * A tap reaches the chart as the browser's compatibility sequence —
 * mousemove, mousedown, mouseup, click at the tap point (measured in
 * Chromium and WebKit touch emulation). The Tooltip keeps Recharts' hover
 * trigger so that mousemove positions the pin: with `trigger="click"` the
 * FIRST tap on a stacked AreaChart pinned index 0 in both engines.
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

/** A tap, as a touch browser delivers it: compat mouse events at the point. */
const tap = (el: Element, clientX: number, clientY: number) =>
  act(async () => {
    fireEvent.mouseMove(el, { clientX, clientY })
    fireEvent.mouseDown(el, { clientX, clientY })
    fireEvent.mouseUp(el, { clientX, clientY })
  })

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
    // The compat sequence without its click: the mousemove alone positions
    // the pin (a click trigger would ignore it).
    await tap(wrapper, 395, 100)
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

  it('the pin outlives the pointer: leaving the chart keeps the value', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.recharts-wrapper')!
    await tap(wrapper, 395, 100)
    await settle()
    await act(async () => {
      fireEvent.mouseLeave(wrapper)
    })
    await settle()
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'Snapshot 2026-10-01'
    )
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

describe('ChartReadout with a chart-owned description (#1705 axis)', () => {
  it('describe() replaces the payload rows when the x axis is not a date', async () => {
    // The membership chart plots program-year days and reads each series
    // at its nearest real point; the chart, not the payload, knows the date.
    stubHover(false)
    function DayHarness() {
      const readout = useChartReadout()
      return (
        <div>
          <LineChart width={400} height={200} data={DATA}>
            <XAxis dataKey="date" />
            <Tooltip {...readout.tooltipProps} />
            <Line dataKey="members" name="Members" isAnimationActive={false} />
          </LineChart>
          <ChartReadout
            readout={readout}
            describe={label => ({
              label: `Described ${label}`,
              rows: [{ key: 'x', name: '2026-27', value: 4242 }],
            })}
          />
        </div>
      )
    }
    const { container } = render(<DayHarness />)
    await tap(container.querySelector('.recharts-wrapper')!, 395, 100)
    await settle()
    const line = screen.getByTestId('chart-readout')
    expect(line).toHaveTextContent('Described 2026-10-01')
    expect(line).toHaveTextContent('2026-27 4,242')
    expect(line).not.toHaveTextContent('Members')
  })
})

describe('ChartReadout on a hover-capable device', () => {
  it('renders no readout line and leaves the tooltip on hover', () => {
    stubHover(true)
    render(<Harness />)
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})
