import React, { Suspense, ComponentProps } from 'react'
import { TrendChartSkeleton } from '../TrendChartSkeleton'

const LazyComponent = React.lazy(() =>
  import('../MembershipTrendChart').then(m => ({
    default: m.MembershipTrendChart,
  }))
)

export type LazyMembershipTrendChartProps = ComponentProps<typeof LazyComponent>

export function LazyMembershipTrendChart(props: LazyMembershipTrendChartProps) {
  return (
    <Suspense
      fallback={
        // #1837: the loaded chart's panel shape, not a bare 300px plot — a
        // short fallback let the next chart paint high and get pushed down.
        // Always the panel shape: this renders the full chart (inline at
        // desktop, or inside the phone expand sheet), never the sparkline.
        <TrendChartSkeleton
          label="membership trend"
          statTiles={4}
          shape="panel"
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
