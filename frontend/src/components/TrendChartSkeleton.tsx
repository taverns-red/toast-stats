import React from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { ChartSkeleton } from './ChartSkeleton'
import { TOUCH_QUERY } from './charts/ChartReadout'
import { useMediaQuery } from '../hooks/useMediaQuery'

/* Loading skeleton for a trend chart wrapped in ChartSparklineExpand (#1837).
 *
 * The bare 400px ChartSkeleton matched neither loaded shape: below 768 the
 * chart collapses to a ~116px sparkline trigger, and at desktop widths the
 * loaded chart is a full panel (title, stat tiles, the 400px plot, legend) of
 * 600–830px. At 1280 the payments chart landed first, painted at y754 under
 * the short membership placeholder, and was pushed off-screen when membership
 * landed (0.05 CLS). This reproduces each loaded shape from its own classes
 * (Lesson 158): the `.chart-spark` trigger box on phones, the panel chrome +
 * stat-tile grid + plot + legend line on desktop. */

const bar = 'animate-pulse bg-gray-200 rounded-sm inline-block'

export interface TrendChartSkeletonProps {
  /** Chart name, for the status label ("Loading membership trend"). */
  label: string
  /** Stat tiles above the plot in the loaded chart (0 for none). */
  statTiles?: number
  /** Plot height of the loaded chart, px. */
  plotHeight?: number
  breakpoint?: number
  /** `panel` forces the desktop shape — for a fallback that always renders
   *  the full chart (inline at desktop, or inside the phone expand sheet). */
  shape?: 'auto' | 'panel'
  /** The loaded chart has a legend-chip row above its plot (#1835). */
  legend?: boolean
}

export const TrendChartSkeleton: React.FC<TrendChartSkeletonProps> = ({
  label,
  statTiles = 0,
  plotHeight = 400,
  breakpoint = 768,
  shape = 'auto',
  legend = false,
}) => {
  const isMobile = useIsMobile(breakpoint)
  // Without hover the loaded chart carries the tap-to-pin readout line
  // under the plot (#1835); reserve it so the chart lands without a shift.
  const touch = useMediaQuery(TOUCH_QUERY)

  if (isMobile && shape === 'auto') {
    return (
      <div
        className="chart-spark"
        role="status"
        aria-label={`Loading ${label}`}
      >
        <div className="chart-spark__trigger" aria-hidden="true">
          <span className="chart-spark__headline">
            <span className={`${bar} w-32`}>&nbsp;</span>
          </span>
          <span className="chart-spark__sparkline" />
          <span className="chart-spark__hint">&nbsp;</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="redesign-panel"
      role="status"
      aria-label={`Loading ${label}`}
    >
      <div aria-hidden="true">
        <div className="mb-6">
          <h2 className="text-xl font-semibold font-tm-headline">
            <span className={`${bar} w-56`}>&nbsp;</span>
          </h2>
          <p className="text-sm mt-1 font-tm-body">
            <span className={`${bar} w-80`}>&nbsp;</span>
          </p>
        </div>
        {statTiles > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: statTiles }, (_, i) => (
              <div key={i} className="rounded-lg p-3 border border-gray-200">
                <p className="text-xs font-medium font-tm-body">&nbsp;</p>
                <p className="text-2xl font-bold font-tm-headline">
                  <span className={`${bar} w-16`}>&nbsp;</span>
                </p>
              </div>
            ))}
          </div>
        )}
        {legend && (
          // The loaded chart's legend-chip row above the plot (#1835): one
          // 44 px chip on the real classes; the row's height is the chip's.
          <div className="chart-legend-chips">
            <span className="chart-legend-chip chart-legend-chip--static">
              &nbsp;
            </span>
          </div>
        )}
        <ChartSkeleton height={plotHeight} />
        {touch && <p className="chart-readout">&nbsp;</p>}
        <div className="mt-4 text-xs">&nbsp;</div>
      </div>
    </div>
  )
}

export default TrendChartSkeleton
