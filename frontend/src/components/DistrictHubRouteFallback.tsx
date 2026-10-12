import React from 'react'
import { DistrictHubTiles } from './DistrictHubTiles'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PHONE_SECTION_BAR_QUERY } from '../config/districtSections'

/* `/district/:id` route fallback (#1901). On upright phones it paints the
   hub's tile skeleton under an empty context-bar slot, laid out exactly as
   the page's own loading state. Elsewhere it renders the generic district
   fallback.

   Upright phones only (PHONE_SECTION_BAR_QUERY), not the whole hub layout:
   there the section nav is the fixed bottom bar, so the hub sits directly
   under the context bar. Short landscape phones also get the hub, but under
   the 45 px section row, so tiles painted here would jump when the page
   mounted.

   Why: the hub's LCP element is the static Net change caption in its loading
   skeleton. Behind a plain spinner fallback, that caption painted only once
   the lazy route chunk had loaded and React had revealed it. React holds a
   Suspense reveal for up to 300 ms after the fallback commits, unless another
   update flushes it first; on a fast load that update was the CDN date index
   arriving. So the caption's paint, and LCP, sat behind the CDN connection and
   `dates.json`. Painting the tiles here puts the caption on the app shell's
   first paint instead.

   The tiles come from the same `DistrictHubTiles` the hub renders, and the
   page keeps the same `.district-detail-page-root` > `.district-detail-page`
   > context bar > hub structure, so nothing moves when the page mounts
   (`DistrictHubRouteFallback.test.tsx` pins the markup). */

export interface DistrictHubRouteFallbackProps {
  /** The generic district route fallback (spinner in the page root). */
  fallback: React.ReactNode
}

export function DistrictHubRouteFallback({
  fallback,
}: DistrictHubRouteFallbackProps): React.JSX.Element {
  const isUprightPhone = useMediaQuery(PHONE_SECTION_BAR_QUERY)
  if (!isUprightPhone) return <>{fallback}</>
  return (
    <div className="district-detail-page-root">
      <div className="district-detail-page">
        <div className="context-bar" aria-hidden="true" />
        <section
          aria-label="Key district metrics"
          aria-busy="true"
          className="district-hub district-hub--loading"
        >
          <DistrictHubTiles kpis={null} />
        </section>
      </div>
    </div>
  )
}
