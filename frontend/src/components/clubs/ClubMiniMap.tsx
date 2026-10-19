import { Component, lazy, Suspense, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  fitClubLocator,
  projectClubPoints,
  type LocatorSource,
} from '../../utils/clubLocator'
import { useNearViewport } from '../../hooks/useNearViewport'
import { supportsWebGL } from '../../utils/webgl'
import { LocatorDots } from '../LocatorDots'

/**
 * The club page's Location mini-map (#1843; tiles since #2162). The
 * district's clubs as grey dots and this club as a red pin, over real map
 * tiles, linking to the district club map with this club selected.
 *
 * Club LCP comes first (#2147). The first paint is an inline SVG of the
 * same dots and pin, drawn from the coordinates the page has already
 * downloaded: no request, a few KB of markup. Only when the hero has painted
 * AND the card nears the viewport does the tile chunk (MapLibre, the shared
 * basemap and pin code) load; the SVG stays until the tiles are painted,
 * then cross-fades out. Without WebGL2, IntersectionObserver, the chunk or
 * the tiles, the SVG simply stays.
 *
 * The view leaves out far-off geocodes (`fitClubLocator`). When this club's
 * own geocode is one, it gets no pin and the caption says why.
 *
 * Renders nothing when the club has no coordinates. Where the club meets is
 * printed as text beside the picture, so nothing depends on the dot alone.
 */
const BOX = { width: 320, height: 160, pad: 32 }

const ClubMiniMapTiles = lazy(() => import('./ClubMiniMapTiles'))

type TileState = 'none' | 'loading' | 'painted' | 'failed'

/** A failed chunk or map construction keeps the SVG; no error page. */
class TilesBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch() {
    this.props.onFail()
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}

/** The tiles group crowded pins (shared pin code); the SVG never does. One
 *  static caption for both, so the swap shifts nothing. */
const GROUPED = ', grouped with a count where they crowd'

const clubsLabel = (n: number, district: string) =>
  `${n} ${district} ${n === 1 ? 'club' : 'clubs'}`

export interface ClubMiniMapProps {
  districtId: string
  clubId: string
  clubName: string
  /** The district's clubs for the page's date (R3: the page's own data). */
  clubs: readonly LocatorSource[]
  /** The where-it-meets place line (street, city, region), if any. */
  place?: string | null | undefined
  /** The page's hero has painted (R3: the page's own gate, #2147). The tile
   *  chunk never loads before it. */
  heroPainted: boolean
  /** #2174: the club meets only online, so the card says so, no map. */
  meetsOnline?: boolean
  /** Its meeting day and time ("Tuesday 7:00 pm"), if known. */
  when?: string | null
}

const LOCATION_ICON = (
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
)

/** #2174: the Location card of a club that meets only online. */
function OnlineCard({ when }: { when: string | null }) {
  return (
    <section
      className="club-panel club-minimap"
      aria-labelledby="club-minimap-title"
    >
      <div className="club-panel__head">
        <h2 id="club-minimap-title">
          {LOCATION_ICON}
          Location
        </h2>
      </div>
      <div className="club-panel__body">
        <p className="club-minimap__online">
          {when ? `Meets online · ${when}` : 'Meets online'}
        </p>
      </div>
    </section>
  )
}

export function ClubMiniMap({
  districtId,
  clubId,
  clubName,
  clubs,
  place,
  heroPainted,
  meetsOnline = false,
  when = null,
}: ClubMiniMapProps) {
  const fit = useMemo(() => fitClubLocator(clubs, clubId), [clubs, clubId])
  const svg = useMemo(() => {
    if (!fit) return null
    const points = projectClubPoints(fit.inView, BOX)
    const focusId = fit.focus?.clubId
    return { points, focus: points.find(p => p.id === focusId) ?? null }
  }, [fit])

  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const near = useNearViewport(frame)
  const [tiles, setTiles] = useState<TileState>('none')
  const wantTiles = heroPainted && near && tiles !== 'failed' && supportsWebGL()
  const state: TileState = tiles === 'none' && wantTiles ? 'loading' : tiles
  // Stable callbacks: the tile chunk subscribes with them.
  const handlers = useMemo(
    () => ({
      painted: () => setTiles('painted'),
      failed: () => setTiles('failed'),
    }),
    []
  )

  // #2174: an online-only club has no place on a map. Say how it meets
  // instead; no timezone is known, so none is shown (or guessed).
  if (meetsOnline) return <OnlineCard when={when} />
  if (!fit || !svg) return null
  const districtLabel = `District ${districtId}`
  const shown = fit.inView.length
  const othersLeftOut = fit.trimmed - (fit.focusIsOutlier ? 1 : 0)
  const label = fit.focusIsOutlier
    ? `${clubsLabel(shown, districtLabel)} with a location; ${clubName}'s mapped location is outside this view`
    : `${clubName} among ${shown} ${districtLabel} clubs with a location`
  const painted = state === 'painted'

  return (
    <section
      className="club-panel club-minimap"
      aria-labelledby="club-minimap-title"
    >
      <div className="club-panel__head">
        <h2 id="club-minimap-title">
          {LOCATION_ICON}
          Location
        </h2>
      </div>
      <div className="club-panel__body">
        <Link
          className="club-minimap__link"
          to={`/district/${districtId}/map?club=${encodeURIComponent(clubId)}`}
          aria-label={`Open ${clubName} on the ${districtLabel} club map`}
        >
          <div
            ref={setFrame}
            className="club-minimap__frame"
            data-tiles={state}
            role="img"
            aria-label={label}
          >
            {wantTiles && (
              <TilesBoundary onFail={handlers.failed}>
                <Suspense fallback={null}>
                  <ClubMiniMapTiles
                    fit={fit}
                    onPainted={handlers.painted}
                    onFailed={handlers.failed}
                  />
                </Suspense>
              </TilesBoundary>
            )}
            <LocatorDots
              className="club-minimap__svg"
              width={BOX.width}
              height={BOX.height}
              points={svg.points}
              focus={svg.focus}
              aria-hidden="true"
              focusable="false"
            />
          </div>
          <span className="club-minimap__cta">
            Open the club map <span aria-hidden="true">›</span>
          </span>
        </Link>
        {/* ODbL credit for the tiles, outside the link (no nested links).
            Its line is reserved from the start, so showing it shifts
            nothing; hidden (and out of the tab order) until the tiles are
            painted. Same links as BASEMAP_ATTRIBUTION. */}
        <p
          className="club-minimap__credit"
          data-visible={String(painted)}
          aria-hidden={painted ? undefined : true}
        >
          Map:{' '}
          <a
            href="https://github.com/protomaps/basemaps"
            target="_blank"
            rel="noopener"
          >
            Protomaps
          </a>{' '}
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener"
          >
            OpenStreetMap
          </a>
        </p>
        <p className="club-minimap__legend">
          {fit.focusIsOutlier
            ? `This club's mapped location is far from the rest of ${districtLabel}, so it is left off this view. Grey: the ${clubsLabel(shown, districtLabel)} with a location${GROUPED}.`
            : `Red pin: this club. Grey: the other ${shown - 1} ${districtLabel} clubs with a location${GROUPED}.`}
          {othersLeftOut > 0 &&
            ` ${othersLeftOut === 1 ? '1 far-off location is' : `${othersLeftOut} far-off locations are`} left out.`}
        </p>
        {place && <p className="club-minimap__place">{place}</p>}
      </div>
    </section>
  )
}
