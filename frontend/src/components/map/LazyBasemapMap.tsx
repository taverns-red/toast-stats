/**
 * LazyBasemapMap — the only door to BasemapMap (#1786).
 *
 * MapLibre is a route-only chunk: it is fetched when a map first renders,
 * never on the landing page. The fallback is a same-size placeholder, since
 * the parent owns the map's box, so the chunk arriving shifts nothing
 * (Lesson 107).
 */
import React, { Suspense } from 'react'
import type { BasemapMapProps } from './BasemapMap'
import './basemap.css'

const BasemapMap = React.lazy(() => import('./BasemapMap'))

export default function LazyBasemapMap(props: BasemapMapProps) {
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
