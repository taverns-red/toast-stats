import React, { Suspense, ComponentProps } from 'react'
import { HistoricalRankChartSkeleton } from '../HistoricalRankChartSkeleton'

const LazyComponent = React.lazy(() => import('../HistoricalRankChart'))

export function LazyHistoricalRankChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense
      fallback={
        // #1835: the chart's own loading state, not a bare 300 px plot, so
        // the chunk landing moves nothing (Recharts-free module).
        <HistoricalRankChartSkeleton programYear={props.selectedProgramYear} />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
