import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

const LazyComponent = React.lazy(() => import('../EducationalAwardsChart'))

export function LazyEducationalAwardsChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense fallback={<ChartSkeleton height={250} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
