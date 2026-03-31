import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

const LazyComponent = React.lazy(() => import('../ComparisonPanel'))

export function LazyComparisonPanel(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense fallback={<ChartSkeleton height={400} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
