import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

const LazyComponent = React.lazy(() =>
  import('../YearOverYearComparison').then(m => ({
    default: m.YearOverYearComparison,
  }))
)

export function LazyYearOverYearComparison(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense fallback={<ChartSkeleton height={250} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
