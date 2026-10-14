import React, { Suspense, ComponentProps } from 'react'
import { TrendChartSkeleton } from '../TrendChartSkeleton'

const LazyComponent = React.lazy(() =>
  import('../MembershipPaymentsChart').then(m => ({
    default: m.MembershipPaymentsChart,
  }))
)

export type LazyMembershipPaymentsChartProps = ComponentProps<
  typeof LazyComponent
>

export function LazyMembershipPaymentsChart(
  props: LazyMembershipPaymentsChartProps
) {
  return (
    <Suspense
      fallback={
        // #1837: the loaded chart's panel shape, not a bare 300px plot — a
        // short fallback let the next chart paint high and get pushed down.
        // Always the panel shape: this renders the full chart (inline at
        // desktop, or inside the phone expand sheet), never the sparkline.
        <TrendChartSkeleton
          label="payments trend"
          statTiles={3}
          plotHeight={350}
          shape="panel"
          legend
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
