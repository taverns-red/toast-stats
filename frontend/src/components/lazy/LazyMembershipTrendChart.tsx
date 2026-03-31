import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

const LazyComponent = React.lazy(() =>
  import('../MembershipTrendChart').then(m => ({
    default: m.MembershipTrendChart,
  }))
)

export type LazyMembershipTrendChartProps = ComponentProps<typeof LazyComponent>

export function LazyMembershipTrendChart(props: LazyMembershipTrendChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={300} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
