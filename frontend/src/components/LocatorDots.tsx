import type { SVGProps } from 'react'
import type { LocatorPoint } from '../utils/clubLocator'

/**
 * The inline-SVG club locator (#1843): clubs as faint dots, an optional focus
 * club as a red pin with a halo. Drawn from projected coordinates the page
 * already has, so it costs no request and no map library.
 *
 * Shared by the club page's mini-map and the district map's static preview
 * (#1943). The caller sets the accessible name or hides it.
 */
export interface LocatorDotsProps extends Omit<
  SVGProps<SVGSVGElement>,
  'viewBox' | 'children' | 'points' | 'width' | 'height'
> {
  width: number
  height: number
  points: readonly LocatorPoint[]
  focus?: LocatorPoint | null
  /** Dot radius in viewBox units. */
  dotRadius?: number
}

const r = (n: number) => Math.round(n * 10) / 10

export function LocatorDots({
  width,
  height,
  points,
  focus = null,
  dotRadius = 2.5,
  ...svg
}: LocatorDotsProps) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} {...svg}>
      {points
        .filter(p => p !== focus)
        .map(p => (
          <circle
            key={p.id}
            className="club-minimap__dot"
            cx={r(p.x)}
            cy={r(p.y)}
            r={dotRadius}
          />
        ))}
      {focus && (
        <>
          <circle
            className="club-minimap__halo"
            cx={r(focus.x)}
            cy={r(focus.y)}
            r="11"
          />
          <circle
            className="club-minimap__pin"
            cx={r(focus.x)}
            cy={r(focus.y)}
            r="6"
          />
        </>
      )}
    </svg>
  )
}
