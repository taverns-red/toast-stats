/**
 * MapPreview — the district map's static preview (#1943).
 *
 * On a throttled phone the first MapLibre-drawn tile cannot arrive before
 * about 3.2 s: the entry code, then MapLibre (232 KB) and its worker
 * (119 KB) are serial bandwidth. So while they load, the map box shows the
 * district's clubs as dots, drawn as inline SVG from the coordinates the page
 * already has: the club page's mini-map (#1843), sized to the box. No tile,
 * no MapLibre, no request beyond this small chunk.
 *
 * It sits over the map, decorative (`aria-hidden`, no pointer events; the
 * map's own region and status carry the meaning), and cross-fades out the
 * first time the live map goes idle, i.e. its first tiles and pins are
 * painted. It is absolutely positioned inside the box the page reserves, so
 * it shifts nothing.
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { projectClubPoints, type LocatorSource } from '../../utils/clubLocator'
import { LocatorDots } from '../LocatorDots'

export interface MapPreviewProps {
  /** The district's clubs for the page's date (R3: the page's own data). */
  clubs: readonly LocatorSource[]
  /** The live map once constructed; the preview fades when it first idles. */
  map: MapLibreMap | null
}

/** The live map's `fitBounds` padding (useClubPins), so the dots land close
 *  to where the pins will. */
const PAD = 48
/** Before layout (and in jsdom), a box of the map's typical aspect. */
const FALLBACK = { width: 400, height: 300 }

export default function MapPreview({ clubs, map }: MapPreviewProps) {
  // A callback ref: the box mounts only once the clubs (data) arrive.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState(FALLBACK)
  const [painted, setPainted] = useState(false)
  // A map that painted before this chunk arrived fires no further idle:
  // latch it during render (React's adjust-state-on-props pattern).
  if (!painted && map?.loaded()) setPainted(true)

  useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0)
        setSize(s =>
          s.width === Math.round(width) && s.height === Math.round(height)
            ? s
            : { width: Math.round(width), height: Math.round(height) }
        )
    }
    measure()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  useEffect(() => {
    if (!map || painted) return
    const done = () => setPainted(true)
    map.once('idle', done)
    return () => {
      map.off('idle', done)
    }
  }, [map, painted])

  const points = useMemo(
    () =>
      projectClubPoints(clubs, {
        ...size,
        pad: Math.min(PAD, size.width / 6, size.height / 6),
      }),
    [clubs, size]
  )
  if (points.length === 0) return null

  return (
    <div
      ref={setEl}
      className="map-preview"
      data-testid="map-preview"
      data-state={painted ? 'painted' : 'loading'}
      aria-hidden="true"
    >
      <LocatorDots
        className="map-preview__svg"
        width={size.width}
        height={size.height}
        points={points}
        dotRadius={4}
        focusable="false"
      />
    </div>
  )
}
