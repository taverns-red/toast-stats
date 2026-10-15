import React from 'react'
import { ChartSkeleton } from './ChartSkeleton'
import { EmptyState } from './ErrorDisplay'
import {
  yearOverYearEmpty,
  type YearOverYearChanges,
  type YearOverYearEmpty,
} from './yearOverYearEmpty'

/* Loading state of the Year-Over-Year Comparison panel (#1835).
 *
 * The panel used to load as a bare 256 px plot (its chunk fallback a 250 px
 * one) and land as a full panel: heading, trend banner, three metric cards,
 * a legend, three 200 px bar charts and the insights box — a shift of over a
 * thousand pixels on a phone, where the grids stack. This reproduces each
 * part on the loaded panel's own classes (Lesson 158), with the static text
 * (titles, metric names, legend) in place and values as blank lines.
 *
 * Recharts-free, so the lazy wrapper paints it as its chunk fallback. */

/** The metrics the loaded panel always shows, in order. */
const METRICS = ['Total Membership', 'Distinguished Clubs', 'Thriving Clubs %']

/** Each per-metric bar chart's height in the loaded panel. */
export const YOY_PLOT_HEIGHT = 200

const blank = <>&nbsp;</>

export const YearOverYearComparisonSkeleton: React.FC = () => (
  <div
    className="redesign-panel"
    role="status"
    aria-busy="true"
    aria-label="Loading year-over-year comparison"
  >
    <div aria-hidden="true">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Year-Over-Year Comparison
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Compare current performance to the same time last program year
        </p>
      </div>

      {/* Overall trend banner */}
      <div className="mb-6 p-4 rounded-lg border-2 bg-gray-50 border-gray-300">
        <div className="flex items-center gap-3">
          <div className="bg-gray-200 rounded-full p-2">
            <span className="block w-6 h-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">{blank}</p>
            <p className="text-sm">{blank}</p>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {METRICS.map(metric => (
          <div
            key={metric}
            className="rounded-lg p-4 border-2 bg-gray-50 border-gray-200"
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {metric}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Previous Year:</span>
                <span className="text-lg font-bold">{blank}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Current Year:</span>
                <span className="text-lg font-bold">{blank}</span>
              </div>
              <div className="pt-2 border-t border-gray-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">
                    Change:
                  </span>
                  <span className="text-sm font-bold">{blank}</span>
                </div>
                <div className="text-right mt-1">
                  <span className="text-xs font-semibold">{blank}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend and the per-metric bar charts */}
      <div className="w-full">
        <div className="flex justify-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: 'var(--tm-cool-gray)' }}
            ></div>
            <span className="text-sm text-gray-600">Previous Year</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: 'var(--tm-loyal-blue)' }}
            ></div>
            <span className="text-sm text-gray-600">Current Year</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {METRICS.map(metric => (
            <div key={metric} className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 text-center mb-2">
                {metric}
              </h4>
              <ChartSkeleton height={YOY_PLOT_HEIGHT} />
            </div>
          ))}
        </div>
      </div>

      {/* Key insights: one line reserved; the loaded list has 1–3 */}
      <div className="mt-6 p-4 bg-tm-loyal-blue-10 border border-tm-loyal-blue-20 rounded-lg">
        <h3 className="text-sm font-semibold text-tm-loyal-blue mb-2 font-tm-headline">
          📊 Key Insights
        </h3>
        <ul className="space-y-1 text-sm font-tm-body">
          <li>{blank}</li>
        </ul>
      </div>
    </div>
  </div>
)

/** The panel's empty state: no prior year, or a deliberate absence. */
export const YearOverYearComparisonEmpty: React.FC<YearOverYearEmpty> = ({
  title,
  message,
}) => <EmptyState title={title} message={message} icon="data" />

/**
 * The lazy chunk fallback (#1835): what the panel itself paints before its
 * charts — skeleton or empty state — so the chunk landing moves nothing.
 */
export const YearOverYearComparisonFallback: React.FC<{
  yearOverYear?: YearOverYearChanges
  isLoading?: boolean
  unavailableReason?: string | null
}> = ({ yearOverYear, isLoading = false, unavailableReason = null }) => {
  if (isLoading) return <YearOverYearComparisonSkeleton />
  const empty = yearOverYearEmpty(yearOverYear, unavailableReason)
  return empty ? (
    <YearOverYearComparisonEmpty {...empty} />
  ) : (
    <YearOverYearComparisonSkeleton />
  )
}
