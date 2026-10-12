import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useGlobalClubsByCountry } from '../hooks/useGlobalHistory'
import { useDarkMode } from '../contexts/DarkModeContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { BottomSheet } from '../components/BottomSheet'
import { WorldChoropleth } from '../components/worldmap/WorldChoropleth'
import { CountryRankTable } from '../components/worldmap/CountryRankTable'
import {
  buildChoroplethView,
  type Placement,
} from '../components/worldmap/countryChoroplethView'
import {
  loadWorldGeometry,
  type WorldGeometry,
} from '../components/worldmap/worldGeometry'
import '../components/worldmap/worldmap.css'

/* /history/countries — worldwide country choropleth (#1797, epic #1781).

   A routed subpage of /history: #1426 ruled the worldwide view extends
   /history rather than becoming a new global page, and ADR-005 rules out
   client-side tabs. The selected country is `?country=<ISO numeric>`, so the
   back button and a shared link restore it.

   Data is the latest snapshot's `global-totals.json` `clubsByCountry` — the
   same query (and the same resolved date) as the /history country table, so
   both surfaces agree. Clubs Find-A-Club could not match to a country are
   stated up front, never folded into a country. */

const PHONE = '(max-width: 767px)'
const PHONE_TOP = 10
const PCT = (n: number, whole: number) =>
  whole > 0 ? Math.round((n / whole) * 1000) / 10 : 0
const NUM = new Intl.NumberFormat('en-US')

const WorldCountriesPage: React.FC = () => {
  useDocumentTitle('Clubs by Country')
  const { isDark } = useDarkMode()
  const theme = isDark ? 'dark' : 'light'
  const isPhone = useMediaQuery(PHONE)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('country')

  const { clubsByCountry, clubsCounted, snapshotDate, isLoading, isError } =
    useGlobalClubsByCountry()

  const [geometry, setGeometry] = useState<WorldGeometry | null>(null)
  const [geometryError, setGeometryError] = useState(false)
  useEffect(() => {
    let live = true
    loadWorldGeometry().then(
      g => live && setGeometry(g),
      () => live && setGeometryError(true)
    )
    return () => {
      live = false
    }
  }, [])

  // Before the geometry arrives every country counts as placeable, so the
  // summary never flashes a "can't be placed" note that then disappears.
  const placements = useMemo(
    () =>
      geometry
        ? new Map<string, Placement>([
            ...geometry.countries.map(c => [c.id, 'polygon'] as const),
            ...geometry.markers.map(m => [m.id, 'marker'] as const),
          ])
        : null,
    [geometry]
  )

  const view = useMemo(
    () =>
      clubsByCountry && clubsCounted !== null
        ? buildChoroplethView(
            clubsByCountry.countries,
            clubsByCountry.unknown,
            clubsCounted,
            id => (placements ? placements.get(id) : 'polygon')
          )
        : null,
    [clubsByCountry, clubsCounted, placements]
  )

  const select = useCallback(
    (isoId: string | null) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (isoId) next.set('country', isoId)
          else next.delete('country')
          return next
        },
        { replace: false }
      )
    },
    [setParams]
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetTrigger = useRef<HTMLButtonElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const selectFromSheet = (isoId: string) => {
    select(isoId)
    setSheetOpen(false)
    mapRef.current?.scrollIntoView({ block: 'nearest' })
  }

  const unavailable = !isLoading && (isError || !view)

  return (
    <div className="placeholder-page wm-page">
      <nav className="wm-page__crumb" aria-label="Breadcrumb">
        <Link to="/history">← History</Link>
      </nav>
      <p className="placeholder-page__eyebrow">Worldwide</p>
      <h1 className="placeholder-page__title">Clubs by country</h1>

      {view && (
        <p className="long-text-lede" data-testid="wm-summary">
          Clubs in <strong>{view.rows.length} countries</strong> at the{' '}
          {snapshotDate} snapshot. {NUM.format(view.unknown.clubs)} clubs (
          {PCT(view.unknown.clubs, view.clubsCounted)}%) were not matched to a
          country by Find-A-Club, so they aren’t on the map; they’re the{' '}
          <strong>Unknown</strong> row of the table.
          {view.notOnMap.length > 0 &&
            ` ${view.notOnMap.length} more ${view.notOnMap.length === 1 ? 'country is' : 'countries are'} listed but can’t be placed on the map.`}
        </p>
      )}

      {unavailable && (
        <div className="wm-unavailable" role="status">
          Clubs by country isn’t available for the latest snapshot right now.
        </div>
      )}

      {!unavailable && (
        <div className="wm-layout">
          <div className="wm-layout__map" ref={mapRef}>
            {view && geometry ? (
              <WorldChoropleth
                geometry={geometry}
                view={view}
                theme={theme}
                selectedId={selectedId}
                onSelect={select}
              />
            ) : geometryError ? (
              <div className="wm-unavailable" role="status">
                The map couldn’t load. The table has every value.
              </div>
            ) : (
              <div
                className="wm-skeleton"
                data-testid="wm-skeleton"
                aria-hidden="true"
              />
            )}
          </div>

          <div className="wm-layout__list">
            {view && (
              <>
                <div
                  className="wm-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Clubs by country table"
                >
                  <CountryRankTable
                    view={view}
                    selectedId={selectedId}
                    onSelect={select}
                    theme={theme}
                    limit={isPhone ? PHONE_TOP : undefined}
                  />
                </div>
                {isPhone && view.rows.length > PHONE_TOP && (
                  <button
                    type="button"
                    ref={sheetTrigger}
                    className="wm-all-btn"
                    aria-haspopup="dialog"
                    aria-controls="wm-all-countries"
                    onClick={() => setSheetOpen(true)}
                  >
                    All {view.rows.length} countries
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {view && isPhone && (
        <BottomSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={`All ${view.rows.length} countries`}
          id="wm-all-countries"
          variant="full"
          returnFocusRef={sheetTrigger}
        >
          <CountryRankTable
            view={view}
            selectedId={selectedId}
            onSelect={selectFromSheet}
            theme={theme}
          />
        </BottomSheet>
      )}
    </div>
  )
}

export default WorldCountriesPage
