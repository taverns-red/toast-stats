import React, { Suspense, ComponentProps } from 'react'
import { importDistrictRankingsTable } from './districtRankingsTableChunk'

const LazyComponent = React.lazy(importDistrictRankingsTable)

export function LazyDistrictRankingsTable(
  props: ComponentProps<typeof LazyComponent>
) {
  return (
    <Suspense
      fallback={
        // Holds the table's place while the chunk lands (it is preloaded with
        // the page, so this is rarely seen) so nothing below it moves.
        <div
          aria-hidden="true"
          data-testid="district-rankings-table-fallback"
          className="min-h-[640px]"
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  )
}
