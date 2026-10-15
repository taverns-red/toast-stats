import React, { Suspense, ComponentProps } from 'react'
import { YearOverYearComparisonFallback } from '../YearOverYearComparisonSkeleton'

const LazyComponent = React.lazy(() =>
  import('../YearOverYearComparison').then(m => ({
    default: m.YearOverYearComparison,
  }))
)

export function LazyYearOverYearComparison(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    // #1835: what the panel paints first (skeleton or empty state), not a
    // bare 250 px plot, so the chunk landing moves nothing.
    <Suspense
      fallback={
        <YearOverYearComparisonFallback
          {...(props.yearOverYear && { yearOverYear: props.yearOverYear })}
          {...(props.isLoading !== undefined && { isLoading: props.isLoading })}
          unavailableReason={props.unavailableReason ?? null}
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
