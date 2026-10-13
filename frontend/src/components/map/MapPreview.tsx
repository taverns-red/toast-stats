import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LocatorSource } from '../../utils/clubLocator'

export interface MapPreviewProps {
  clubs: readonly LocatorSource[]
  map: MapLibreMap | null
}

// #1943: red-phase stub; the preview lands in the next commit.
export default function MapPreview(_props: MapPreviewProps) {
  return null
}
