import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

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
    <Suspense fallback={<ChartSkeleton height={300} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
