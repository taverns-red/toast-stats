import React, { Suspense, ComponentProps } from 'react'
import { FullYearRankingChartFallback } from '../FullYearRankingChartSkeleton'

const LazyComponent = React.lazy(() => import('../FullYearRankingChart'))

export function LazyFullYearRankingChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense
      fallback={
        // #1835: what the chart paints first (loading panel or empty state),
        // not a bare 300 px plot, so the chunk landing moves nothing.
        <FullYearRankingChartFallback {...props} />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
