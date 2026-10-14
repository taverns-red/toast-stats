/**
 * Unpinning the tap-to-pin readout (#1835, mobile epic #1827).
 *
 * A pin that cannot be taken back is a sticky tooltip. On a device without
 * hover the readout line is the chart's only value surface, so:
 * - a second tap on the pinned point unpins it (the hint returns);
 * - a tap on another point moves the pin instead;
 * - Escape unpins without closing the expand sheet around the chart (the
 *   sheet listens on the document), and a second Escape reaches the sheet;
 * - Enter pins the point the keyboard last read, and unpins it again.
 *
 * A tap reaches the chart as mousemove, mousedown, mouseup, click at the
 * tap point. Recharts runs the chart's `onClick` after its mousemove has
 * placed the active point, so the click reports the tapped index.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { useChartReadout, ChartReadout, TOUCH_QUERY } from '../ChartReadout'

const DATA = [
  { date: '2026-08-01', members: 100 },
  { date: '2026-09-01', members: 120 },
  { date: '2026-10-01', members: 130 },
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
    <div {...readout.surfaceProps} data-testid="surface">
      <LineChart width={400} height={200} data={DATA} {...readout.chartProps}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip {...readout.tooltipProps} />
        <Line dataKey="members" name="Members" isAnimationActive={false} />
      </LineChart>
      <ChartReadout readout={readout} />
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const settle = () => act(async () => new Promise(r => setTimeout(r, 40)))

/** A whole tap, as a touch browser delivers it. */
async function tap(el: Element, clientX: number, clientY = 100) {
  await act(async () => {
    fireEvent.mouseMove(el, { clientX, clientY })
    fireEvent.mouseDown(el, { clientX, clientY })
    fireEvent.mouseUp(el, { clientX, clientY })
    fireEvent.click(el, { clientX, clientY })
  })
  await settle()
}

const HINT = 'Tap the chart to read a value'

describe('unpinning the chart readout on touch (#1835)', () => {
  it('a second tap on the pinned point unpins it and the hint returns', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.recharts-wrapper')!
    const line = screen.getByTestId('chart-readout')

    await tap(wrapper, 395)
    expect(line).toHaveTextContent('2026-10-01')

    await tap(wrapper, 395)
    expect(line).toHaveTextContent(HINT)
    expect(line).not.toHaveTextContent('2026-10-01')

    // A third tap on the same point pins it again.
    await tap(wrapper, 395)
    expect(line).toHaveTextContent('2026-10-01')
  })

  it('a tap on another point moves the pin instead of unpinning', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.recharts-wrapper')!
    const line = screen.getByTestId('chart-readout')

    await tap(wrapper, 395)
    expect(line).toHaveTextContent('2026-10-01')
    await tap(wrapper, 70)
    expect(line).toHaveTextContent('2026-08-01')
  })

  it('Escape unpins without reaching the document, then the next Escape does', async () => {
    stubHover(false)
    const onDocKey = vi.fn()
    document.addEventListener('keydown', onDocKey)
    try {
      const { container } = render(<Harness />)
      const wrapper = container.querySelector('.recharts-wrapper')!
      const line = screen.getByTestId('chart-readout')
      await tap(wrapper, 395)
      expect(line).toHaveTextContent('2026-10-01')

      const surface = screen.getByTestId('surface')
      await act(async () => {
        fireEvent.keyDown(surface, { key: 'Escape' })
      })
      expect(line).toHaveTextContent(HINT)
      expect(onDocKey).not.toHaveBeenCalled()

      // Nothing pinned: Escape is the sheet's again (it closes the sheet).
      await act(async () => {
        fireEvent.keyDown(surface, { key: 'Escape' })
      })
      expect(onDocKey).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', onDocKey)
    }
  })

  it('Enter pins the last read point and a second Enter unpins it', async () => {
    stubHover(false)
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.recharts-wrapper')!
    const line = screen.getByTestId('chart-readout')
    const surface = screen.getByTestId('surface')

    await tap(wrapper, 395)
    await act(async () => {
      fireEvent.keyDown(surface, { key: 'Escape' })
    })
    expect(line).toHaveTextContent(HINT)

    await act(async () => {
      fireEvent.keyDown(surface, { key: 'Enter' })
    })
    expect(line).toHaveTextContent('2026-10-01')

    await act(async () => {
      fireEvent.keyDown(surface, { key: 'Enter' })
    })
    expect(line).toHaveTextContent(HINT)
  })
})

describe('the unpin handlers on a hover device', () => {
  it('add nothing to the chart or its wrapper', () => {
    stubHover(true)
    function Probe() {
      const { chartProps, surfaceProps } = useChartReadout()
      return (
        <span data-testid="probe">
          {Object.keys(chartProps).length}/{Object.keys(surfaceProps).length}
        </span>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('0/0')
  })
})
