import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TooltipContentProps, MouseHandlerDataParam } from 'recharts'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { parseLocalDate } from '../../utils/dateFormatting'

/* Tap-to-pin chart readout (#1835, mobile epic #1827 Phase 1 item 13).

   A Recharts tooltip opens on hover. On a device that cannot hover a tap
   never opens it (review §4.1: `.recharts-tooltip-wrapper` stayed hidden
   after a tap), so the chart had no value readout at all on phones.

   The shared primitive, for every Recharts chart:
   - `useChartReadout()` — on `(hover: none)` returns Tooltip props that
     replace the floating box with a reporter that renders nothing and hands
     the active point up; the readout keeps the last point, so it stays
     pinned. A tap reaches the chart as mousemove → mousedown → mouseup →
     click at the tap point (Chromium and WebKit), so Recharts' default hover
     trigger positions the pin; `trigger="click"` pinned index 0 on the first
     tap of a stacked AreaChart. Recharts' accessibility layer drives the
     same active state from the arrow keys, so the keyboard pins values too.
     On hover devices it returns `{}` — the chart is untouched.
   - `<ChartReadout>` — the persistent value line under the chart. Its slot
     is reserved (a hint before the first tap) so pinning never shifts
     layout. Text wears ink; the series colour is only a swatch.

   Charts spread `readout.tooltipProps` AFTER their own Tooltip props, so the
   override wins only where it applies. */

/** Devices that cannot hover (phones, tablets). */
export const TOUCH_QUERY = '(hover: none)'

export interface ChartReadingRow {
  key: string
  name: string
  value: number | string
  color?: string
}

export interface ChartReading {
  label: string
  rows: ChartReadingRow[]
}

type TooltipValue = number | string
/** What the readout overrides on a chart's <Tooltip>: nothing on hover
 *  devices; the reporter content without hover. */
type TooltipOverride = Record<string, never> | { content: React.ReactElement }

/** Hover devices: the chart's own Tooltip props stand. */
const NO_OVERRIDE: TooltipOverride = {}

export interface ChartReadoutHandle {
  /** True on a device without hover — the readout line is in use. */
  touch: boolean
  /** The pinned point, or null before the first tap / key press and
   *  after an unpin (a second tap on it, Escape, Enter). */
  reading: ChartReading | null
  /** Spread onto the chart's <Tooltip> after its own props. */
  tooltipProps: TooltipOverride
  /** Spread onto the Recharts chart element (LineChart, AreaChart). */
  chartProps: ChartPinProps
  /** Spread onto the element wrapping the chart (keyboard pin/unpin). */
  surfaceProps: SurfacePinProps
}

type ChartPinProps =
  Record<string, never> | { onClick: (state: MouseHandlerDataParam) => void }
type SurfacePinProps =
  Record<string, never> | { onKeyDown: (e: React.KeyboardEvent) => void }

const readingKey = (r: ChartReading) =>
  `${r.label}\u0000${r.rows.map(x => `${x.key}=${x.value}`).join('\u0000')}`

/** Tooltip content that paints nothing and reports the active point. */
const ReadoutReporter: React.FC<
  Partial<TooltipContentProps<TooltipValue, string>> & {
    onReading: (r: ChartReading, index: string | null) => void
  }
> = ({ active, payload, label, activeIndex, onReading }) => {
  const last = useRef('')
  const reading = useMemo<ChartReading | null>(() => {
    if (!active || !payload || payload.length === 0) return null
    return {
      label: label == null ? '' : String(label),
      rows: payload
        .filter(p => p.value != null && !p.hide)
        .map(p => ({
          key: String(p.dataKey ?? p.name ?? ''),
          name: String(p.name ?? p.dataKey ?? ''),
          value: p.value as TooltipValue,
          ...(p.color ? { color: p.color } : {}),
        })),
    }
  }, [active, payload, label])

  useEffect(() => {
    // An inactive tooltip keeps the last pin — the readout is persistent.
    if (!reading) return
    const key = readingKey(reading)
    if (key === last.current) return
    last.current = key
    onReading(reading, activeIndex == null ? null : String(activeIndex))
  }, [reading, activeIndex, onReading])

  return null
}

/** Hover devices: nothing is added to the chart or its wrapper. */
const NO_CHART_PROPS: ChartPinProps = {}
const NO_SURFACE_PROPS: SurfacePinProps = {}

export function useChartReadout(): ChartReadoutHandle {
  const touch = useMediaQuery(TOUCH_QUERY)
  // `latest` is the point the chart last made active; the line shows it
  // only while `pinned`. Refs mirror both so the event handlers below read
  // the current values whichever order Recharts delivers a tap's events in.
  const [latest, setLatest] = useState<ChartReading | null>(null)
  const [pinned, setPinnedState] = useState(false)
  const latestRef = useRef<ChartReading | null>(null)
  const pinnedRef = useRef(false)
  const lastLabelRef = useRef<string | null>(null)
  // The index the previous tap landed on, while that tap's pin stands.
  const tappedIndexRef = useRef<string | null>(null)
  // A click that arrived before its mousemove placed the active point: the
  // next reading names the index it landed on.
  const tapPendingRef = useRef(false)

  const setPinned = useCallback((next: boolean) => {
    pinnedRef.current = next
    setPinnedState(next)
  }, [])

  const onReading = useCallback(
    (r: ChartReading, index: string | null) => {
      latestRef.current = r
      if (tapPendingRef.current) {
        tapPendingRef.current = false
        tappedIndexRef.current = index
      }
      setLatest(r)
      // A new x position pins it (a tap elsewhere, an arrow key). The same
      // x with other rows (a series toggled off) only refreshes the values.
      if (r.label !== lastLabelRef.current) {
        lastLabelRef.current = r.label
        setPinned(true)
      }
    },
    [setPinned]
  )

  const tooltipProps = useMemo<TooltipOverride>(() => {
    if (!touch) return NO_OVERRIDE
    return { content: <ReadoutReporter onReading={onReading} /> }
  }, [touch, onReading])

  const chartProps = useMemo<ChartPinProps>(() => {
    if (!touch) return NO_CHART_PROPS
    return {
      // Recharts runs onClick after the tap's mousemove has placed the
      // active point, so the state names the index the tap landed on.
      onClick: (state: MouseHandlerDataParam) => {
        const index = state?.activeTooltipIndex ?? state?.activeIndex
        if (index == null) {
          tapPendingRef.current = true
          return
        }
        tapPendingRef.current = false
        const tapped = String(index)
        if (pinnedRef.current && tappedIndexRef.current === tapped) {
          // A second tap on the pinned point takes the pin back.
          tappedIndexRef.current = null
          setPinned(false)
          return
        }
        tappedIndexRef.current = tapped
        if (latestRef.current) setPinned(true)
      },
    }
  }, [touch, setPinned])

  const surfaceProps = useMemo<SurfacePinProps>(() => {
    if (!touch) return NO_SURFACE_PROPS
    return {
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (!pinnedRef.current) return // the sheet's Escape: close it
          // Unpin only; the expand sheet listens on the document.
          e.stopPropagation()
          tappedIndexRef.current = null
          setPinned(false)
        } else if (e.key === 'Enter') {
          tappedIndexRef.current = null
          if (pinnedRef.current) setPinned(false)
          else if (latestRef.current) setPinned(true)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          tappedIndexRef.current = null
          if (latestRef.current) setPinned(true)
        }
      },
    }
  }, [touch, setPinned])

  return {
    touch,
    reading: pinned ? latest : null,
    tooltipProps,
    chartProps,
    surfaceProps,
  }
}

export interface ChartReadoutProps {
  readout: ChartReadoutHandle
  /** Formats the x label (e.g. a date) for the line. */
  labelFormatter?: (label: string) => string
  /**
   * The chart describes the pinned x itself — for an axis that is not a
   * date (e.g. program-year days), where each series is read at its own
   * nearest point. Replaces the payload's label and rows; null keeps them.
   */
  describe?: (label: string) => ChartReading | null
  /** Formats each series name (e.g. a district id → its name). */
  nameFormatter?: (name: string) => string
  /** Formats each series value. Default: locale number. */
  valueFormatter?: (value: number | string, name: string) => string
  /** Shown before the first tap. */
  hint?: string
}

/** A snapshot date (YYYY-MM-DD) as the readout shows it: "Oct 10, 2026". */
export const formatReadoutDate = (iso: string): string =>
  parseLocalDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const defaultValue = (v: number | string) =>
  typeof v === 'number' ? v.toLocaleString('en-US') : v

/** The persistent value line under a chart. Renders only without hover. */
export const ChartReadout: React.FC<ChartReadoutProps> = ({
  readout,
  labelFormatter,
  describe,
  nameFormatter,
  valueFormatter,
  hint = 'Tap the chart to read a value',
}) => {
  if (!readout.touch) return null
  const reading =
    readout.reading && describe
      ? (describe(readout.reading.label) ?? readout.reading)
      : readout.reading
  // A described reading is already in display form.
  const formatLabel = describe ? undefined : labelFormatter
  return (
    <p
      className="chart-readout"
      data-testid="chart-readout"
      role="status"
      aria-live="polite"
    >
      {reading ? (
        <>
          <span className="chart-readout__label">
            {formatLabel ? formatLabel(reading.label) : reading.label}
          </span>
          {reading.rows.map(row => (
            <span key={row.key} className="chart-readout__item">
              <span
                className="chart-readout__swatch"
                aria-hidden="true"
                style={row.color ? { backgroundColor: row.color } : undefined}
              />
              {nameFormatter ? nameFormatter(row.name) : row.name}{' '}
              <span className="chart-readout__value">
                {valueFormatter
                  ? valueFormatter(row.value, row.name)
                  : defaultValue(row.value)}
              </span>
            </span>
          ))}
        </>
      ) : (
        <span className="chart-readout__hint">{hint}</span>
      )}
    </p>
  )
}
