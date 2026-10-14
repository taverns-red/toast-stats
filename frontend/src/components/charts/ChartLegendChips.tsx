import React, { useCallback, useMemo, useState } from 'react'

/* Chart legend as toggle chips (#1835, mobile epic #1827 Phase 1 item 13).

   Recharts' default legend is a 36 px strip of 12 px labels inside the plot
   that only a pointer can use. This is the series legend for every
   multi-series chart, outside the plot:
   - one `<button aria-pressed>` per series; pressed = the series is drawn;
   - every series starts drawn, so a chip's first tap hides exactly what it
     shows (no select-all ambiguity — resolve toggles against aria-pressed);
   - the last drawn series cannot be hidden (an empty plot reads as "no
     data"); its chip says so with aria-disabled;
   - a lone series is a static label: a toggle with nothing to compare is
     a dead control.
   Text wears ink; the series colour is only the swatch (#1616, #1904). */

export interface LegendSeries {
  key: string
  name: string
  /** The series stroke — painted on the swatch only. */
  color: string
  /** SVG stroke-dasharray, for a dashed series. */
  dash?: string
}

export interface SeriesVisibility {
  isVisible: (key: string) => boolean
  /** Toggle `key`; `all` is every series key, so the last one stays drawn. */
  toggle: (key: string, all: readonly string[]) => void
}

/** Which series are drawn. Call before a chart's early returns. */
export function useSeriesVisibility(): SeriesVisibility {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden])
  const toggle = useCallback((key: string, all: readonly string[]) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        return next
      }
      const drawn = all.filter(k => !next.has(k))
      if (drawn.length <= 1) return prev
      next.add(key)
      return next
    })
  }, [])
  return useMemo(() => ({ isVisible, toggle }), [isVisible, toggle])
}

export interface ChartLegendChipsProps {
  series: readonly LegendSeries[]
  visibility: SeriesVisibility
  /** Accessible name of the chip group. */
  label?: string
}

const Swatch: React.FC<{ series: LegendSeries }> = ({ series }) => (
  <svg
    className="chart-legend-chip__swatch"
    width="16"
    height="10"
    viewBox="0 0 16 10"
    aria-hidden="true"
  >
    <line
      x1="0"
      y1="5"
      x2="16"
      y2="5"
      stroke={series.color}
      strokeWidth="3"
      strokeLinecap="round"
      {...(series.dash ? { strokeDasharray: series.dash } : {})}
    />
  </svg>
)

export const ChartLegendChips: React.FC<ChartLegendChipsProps> = ({
  series,
  visibility,
  label = 'Chart series',
}) => {
  if (series.length === 0) return null

  if (series.length === 1) {
    const only = series[0]!
    return (
      <div className="chart-legend-chips">
        <span className="chart-legend-chip chart-legend-chip--static">
          <Swatch series={only} />
          {only.name}
        </span>
      </div>
    )
  }

  const keys = series.map(s => s.key)
  const drawnCount = keys.filter(k => visibility.isVisible(k)).length

  return (
    <div className="chart-legend-chips" role="group" aria-label={label}>
      {series.map(s => {
        const pressed = visibility.isVisible(s.key)
        const locked = pressed && drawnCount <= 1
        return (
          <button
            key={s.key}
            type="button"
            className="chart-legend-chip"
            aria-pressed={pressed}
            {...(locked ? { 'aria-disabled': true } : {})}
            onClick={() => {
              if (!locked) visibility.toggle(s.key, keys)
            }}
          >
            <Swatch series={s} />
            {s.name}
          </button>
        )
      })}
    </div>
  )
}

export default ChartLegendChips
