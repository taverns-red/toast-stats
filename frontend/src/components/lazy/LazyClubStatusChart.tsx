import React, { Suspense, ComponentProps } from 'react'
import { ChartSkeleton } from '../ChartSkeleton'

const LazyComponent = React.lazy(() => import('../ClubStatusChart'))

export function LazyClubStatusChart(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense fallback={<ChartSkeleton height={300} />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}
