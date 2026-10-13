import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { projectClubLocator, type LocatorSource } from '../../utils/clubLocator'
import { LocatorDots } from '../LocatorDots'

/**
 * #1843 — the club page's static mini-map (review §6.3, feature design §3.2
 * change 7). An inline SVG of the district's clubs as faint dots with this
 * club as a pin, linking to the district club map with the club selected.
 *
 * Why not a raster tile or a second MapLibre: the basemap is a vector
 * PMTiles archive (ADR-016), so a raster needs either MapLibre on the client
 * (~250 KB gzip, the map route's budget) or a pre-rendered image per club
 * (a new pipeline artifact). This draws from coordinates the page has
 * already downloaded: zero extra requests, a few KB of markup.
 *
 * Renders nothing when the club has no coordinates. Where the club meets is
 * printed as text beside the picture, so nothing depends on the dot alone.
 */
const BOX = { width: 320, height: 160, pad: 14 }

export interface ClubMiniMapProps {
  districtId: string
  clubId: string
  clubName: string
  /** The district's clubs for the page's date (R3: the page's own data). */
  clubs: readonly LocatorSource[]
  /** The where-it-meets place line (street, city, region), if any. */
  place?: string | null | undefined
}

export function ClubMiniMap({
  districtId,
  clubId,
  clubName,
  clubs,
  place,
}: ClubMiniMapProps) {
  const locator = useMemo(
    () => projectClubLocator(clubs, clubId, BOX),
    [clubs, clubId]
  )
  if (!locator?.focus) return null
  const { points, focus } = locator
  const districtLabel = `District ${districtId}`

  return (
    <section
      className="club-panel club-minimap"
      aria-labelledby="club-minimap-title"
    >
      <div className="club-panel__head">
        <h2 id="club-minimap-title">
          <svg
            className="club-panel__ico"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z" />
            <circle cx="8" cy="6.5" r="1.5" />
          </svg>
          Location
        </h2>
      </div>
      <div className="club-panel__body">
        <Link
          className="club-minimap__link"
          to={`/district/${districtId}/map?club=${encodeURIComponent(clubId)}`}
          aria-label={`Open ${clubName} on the ${districtLabel} club map`}
        >
          <LocatorDots
            className="club-minimap__svg"
            width={BOX.width}
            height={BOX.height}
            points={points}
            focus={focus}
            role="img"
            aria-label={`${clubName} among ${points.length} ${districtLabel} clubs with a location`}
          />
          <span className="club-minimap__cta">
            Open the club map <span aria-hidden="true">›</span>
          </span>
        </Link>
        <p className="club-minimap__legend">
          Red pin: this club. Grey dots: the other {points.length - 1}{' '}
          {districtLabel} clubs with a location.
        </p>
        {place && <p className="club-minimap__place">{place}</p>}
      </div>
    </section>
  )
}
