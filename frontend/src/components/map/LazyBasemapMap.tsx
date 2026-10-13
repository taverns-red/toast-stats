/**
 * LazyBasemapMap — the only door to BasemapMap (#1786).
 *
 * MapLibre is a route-only chunk: it is fetched when a map first renders,
 * never on the landing page. The fallback is a same-size placeholder, since
 * the parent owns the map's box, so the chunk arriving shifts nothing
 * (Lesson 107).
 *
 * It also starts reading the archive head here, while the MapLibre chunk is
 * still downloading, rather than after it (#1943, `basemapPrefetch.ts`).
 */
import React, { Suspense } from 'react'
import type { BasemapMapProps } from './BasemapMap'
import { basemapUrl } from '../../config/basemap'
import { prefetchBasemapHead } from './basemapPrefetch'
import './basemap.css'

const BasemapMap = React.lazy(() => import('./BasemapMap'))

export default function LazyBasemapMap(props: BasemapMapProps) {
  // Idempotent per URL, so calling it on every render is one request.
  void prefetchBasemapHead(props.pmtilesUrl ?? basemapUrl())
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading map"
          data-testid="basemap-loading"
          className="basemap-surface"
          style={{ width: '100%', height: '100%' }}
        />
      }
    >
      <BasemapMap {...props} />
    </Suspense>
  )
}
