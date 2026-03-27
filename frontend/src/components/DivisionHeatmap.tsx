import type { DivisionHeatmapData } from '@toastmasters/analytics-core'
import ChartAccessibility from './ChartAccessibility'
import './DivisionHeatmap.css'

interface DivisionHeatmapProps {
  data: DivisionHeatmapData[]
}

/**
 * Convert a 0–1 score to a CSS color on a red→yellow→green scale.
 */
function scoreToColor(score: number): string {
  const hue = Math.round(score * 120) // 0=red, 60=yellow, 120=green
  return `hsl(${hue}, 70%, 45%)`
}

/**
 * Division health heatmap — grid of divisions × metrics with color-coded cells.
 * Accessible via role="grid" and ChartAccessibility data table fallback.
 */
export function DivisionHeatmap({ data }: DivisionHeatmapProps) {
  if (data.length === 0) {
    return null
  }

  const metrics = data[0]?.cells.map(c => c.label) ?? []

  // Build table data for ChartAccessibility fallback
  const tableData = {
    headers: ['Division', ...metrics],
    rows: data.map(row => [
      row.divisionName,
      ...row.cells.map(c => c.rawValue),
    ]),
  }

  return (
    <ChartAccessibility
      ariaLabel="Division health heatmap showing performance across key metrics"
      caption="Division Health Heatmap"
      tableData={tableData}
    >
      <div
        className="division-heatmap"
        role="grid"
        aria-label="Division health heatmap"
      >
        {/* Header row */}
        <div
          className="division-heatmap__row division-heatmap__header"
          role="row"
        >
          <div className="division-heatmap__label" role="columnheader">
            Division
          </div>
          {metrics.map(metric => (
            <div
              key={metric}
              className="division-heatmap__cell-header"
              role="columnheader"
            >
              {metric}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {data.map(row => (
          <div
            key={row.divisionId}
            className="division-heatmap__row"
            role="row"
          >
            <div className="division-heatmap__label" role="rowheader">
              {row.divisionName}
            </div>
            {row.cells.map(cell => (
              <div
                key={cell.metric}
                className="division-heatmap__cell"
                role="gridcell"
                style={{ backgroundColor: scoreToColor(cell.score) }}
                title={`${cell.label}: ${cell.rawValue} (score: ${cell.score})`}
                aria-label={`${cell.label}: ${cell.rawValue}`}
              >
                {cell.rawValue}
              </div>
            ))}
          </div>
        ))}
      </div>
    </ChartAccessibility>
  )
}
