import React, { Suspense, ComponentProps } from 'react'
import { YearOverYearComparisonSkeleton } from '../YearOverYearComparisonSkeleton'

const LazyComponent = React.lazy(() =>
  import('../YearOverYearComparison').then(m => ({
    default: m.YearOverYearComparison,
  }))
)

export function LazyYearOverYearComparison(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    // #1835: the panel's own loading state, not a bare 250 px plot.
    <Suspense fallback={<YearOverYearComparisonSkeleton />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
