import React, { Suspense, ComponentProps } from 'react'
import { FullYearRankingChartSkeleton } from '../FullYearRankingChartSkeleton'

const LazyComponent = React.lazy(() => import('../FullYearRankingChart'))

export function LazyFullYearRankingChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense
      fallback={
        // #1835: the chart's own loading state, not a bare 300 px plot, so
        // the chunk landing moves nothing (Recharts-free module).
        <FullYearRankingChartSkeleton
          programYear={props.programYear}
          selectedMetric={props.selectedMetric}
          onMetricChange={props.onMetricChange}
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
