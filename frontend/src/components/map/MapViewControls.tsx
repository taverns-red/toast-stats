/**
 * MapViewControls — the interactive club maps' control stack (#2173): zoom
 * in, zoom out and "Reset map view" (⌂). Reset is the caller's: it refits to
 * the pins' initial framing (`useClubPins().resetView`, the same fitBounds
 * the first view used) and closes any open club card. The club page's
 * non-interactive mini-map has no stack.
 *
 * Real buttons, so they are in the tab order with their names; the icons are
 * inline SVG (no glyph font, ADR-016) and take the text colour, so the
 * map's theme tokens style them in both themes (R10).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'

export interface MapViewControlsProps {
  /** Null until MapLibre is up: the stack holds its place, disabled. */
  map: MapLibreMap | null
  onReset: () => void
}

const icon = (d: string) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function MapViewControls({
  map,
  onReset,
}: MapViewControlsProps) {
  return (
    <div className="map-view-controls" role="group" aria-label="Map view">
      <button
        type="button"
        className="map-view-controls__btn"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!map}
        onClick={() => map?.zoomIn()}
      >
        {icon('M9 3.5v11M3.5 9h11')}
      </button>
      <button
        type="button"
        className="map-view-controls__btn"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!map}
        onClick={() => map?.zoomOut()}
      >
        {icon('M3.5 9h11')}
      </button>
      <button
        type="button"
        className="map-view-controls__btn"
        aria-label="Reset map view"
        title="Reset map view"
        disabled={!map}
        onClick={onReset}
      >
        {icon('M2.5 8.5 9 3l6.5 5.5M4.5 7v7.5h3.5v-4h2v4h3.5V7')}
      </button>
    </div>
  )
}
