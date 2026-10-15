import React, { Suspense, ComponentProps } from 'react'
import { HistoricalRankChartFallback } from '../HistoricalRankChartSkeleton'

const LazyComponent = React.lazy(() => import('../HistoricalRankChart'))

export function LazyHistoricalRankChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense
      fallback={
        // #1835: what the chart paints first (loading panel, error or empty
        // state), not a bare 300 px plot, so the chunk landing moves nothing.
        <HistoricalRankChartFallback {...props} />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
