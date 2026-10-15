import React from 'react'
import { Link, useSearchParams, type To } from 'react-router-dom'
import type {
  ClubTrend,
  ProspectiveClub,
} from '../../hooks/useDistrictAnalytics'
import type { LegendChip, ModeModel } from './pinModes'
import { PinSwatch } from './PinSwatch'
import { MobileRowList, type MobileRow } from '../MobileRowList'

/* The map page's club lists (#1784): clubs not on the map, prospective
   clubs, and the `?view=list` list. Data-dependent, so the page loads this
   chunk alongside the data rather than on the route's first load.

   Privacy: names, places and links only — never email, phone, meeting
   links or passcodes (prospective rows carry an email; it is not read). */

export const ClubLinks: React.FC<{
  clubs: ClubTrend[]
  districtId: string
  model?: ModeModel | undefined
  label: string
}> = ({ clubs, districtId, model, label }) => (
  <ul className="map-list" aria-label={label}>
    {clubs.map(c => {
      const cat = model?.categoryOf(c)
      return (
        <li key={c.clubId}>
          <Link to={`/district/${districtId}/club/${c.clubId}`}>
            {cat && <PinSwatch category={cat} />}
            <span className="map-list__name">{c.clubName}</span>
            <span className="map-list__meta">
              {cat
                ? cat.label
                : [c.divisionId, c.areaId].filter(Boolean).join(' / ')}
            </span>
          </Link>
        </li>
      )
    })}
  </ul>
)

/** The `?view=list` list (#1945): the shared MobileRowList rows the Clubs
 *  page uses — 56–64 px whole-row links, ≥ 44 px targets, 50 then "Show 25
 *  more". The chip is the club's pin (shape + words, never colour alone)
 *  in the current colour mode; line 2 is "Div C · Area 23", short enough
 *  to sit beside the longest chip at 375. */
export const ClubRows: React.FC<{
  clubs: ClubTrend[]
  districtId: string
  model?: ModeModel | undefined
  label: string
}> = ({ clubs, districtId, model, label }) => {
  const rows: MobileRow[] = clubs.map(c => {
    const cat = model?.categoryOf(c)
    return {
      id: c.clubId,
      to: `/district/${districtId}/club/${c.clubId}`,
      title: c.clubName,
      chip: cat && (
        <span className="map-row-chip">
          <PinSwatch category={cat} />
          {cat.label}
        </span>
      ),
      meta: [
        c.divisionId && `Div ${c.divisionId}`,
        c.areaId && `Area ${c.areaId}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }
  })
  return (
    <MobileRowList
      label={label}
      noun="clubs"
      chipPlacement="meta"
      rows={rows}
    />
  )
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const id = React.useId()
  return (
    <section className="map-panel__section" aria-labelledby={id}>
      <h3 id={id} className="map-panel__heading">
        {title}
      </h3>
      {children}
    </section>
  )
}

export const MapLists: React.FC<{
  unmapped: ClubTrend[]
  prospective: ProspectiveClub[]
  districtId: string
  /** Closes the phone sheet this may sit in before the sandbox opens. */
  onSandbox?: () => void
}> = ({ unmapped, prospective, districtId, onSandbox }) => (
  <>
    <Section title={`Not on the map (${unmapped.length})`}>
      <p className="map-panel__note">
        {unmapped.length
          ? 'No Find-a-Club location'
          : 'Every club in view has a location.'}
      </p>
      <ClubLinks
        clubs={unmapped}
        districtId={districtId}
        label="Clubs not on the map"
      />
    </Section>
    <Section title={`Prospective (${prospective.length})`}>
      <p className="map-panel__note">
        Not yet chartered, so not pinned: Find-a-Club lists their town only.
      </p>
      <ul className="map-list" aria-label="Prospective clubs">
        {prospective.map(p => (
          <li key={p.clubId}>
            <span className="map-list__name">{p.clubName}</span>
            <span className="map-list__meta">
              {[p.city, p.region].filter(Boolean).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </Section>
    <SandboxEntry onOpen={onSandbox} />
  </>
)

/** The realignment sandbox's way in (#1819): kept behind the map (spec
 *  §2.8), in this on-demand chunk so the map's first load carries none of
 *  it. A push, so Back leaves the sandbox. */
const SandboxEntry: React.FC<{ onOpen?: (() => void) | undefined }> = ({
  onOpen,
}) => {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.delete('view')
  next.delete('plan')
  next.set('sandbox', '1')
  return (
    <Section title="Realignment">
      <p className="map-panel__note">
        Try moving clubs between areas and see the balance change. Nothing is
        saved.
      </p>
      <Link
        className="map-club__link"
        to={{ search: `?${next}` }}
        onClick={onOpen}
      >
        Open the realignment sandbox
      </Link>
    </Section>
  )
}

/** What the cluster pip means, in the mode's own words (#1787). */
function pipNote(model: ModeModel): string {
  const k = model.exceptionKey
  if (!k) return ''
  if (k === 'intervention-required')
    return '; a red square marks clusters with clubs needing intervention'
  const label = model.categories.find(c => c.key === k)?.label
  return label ? `; a small square marks clusters with “${label}” clubs` : ''
}

/** Legend chips (#1784): aria-pressed toggles writing the mode facet. */
export const LegendChips: React.FC<{
  model: ModeModel
  chips: LegendChip[]
  pressed: string[]
  onToggle: (chip: LegendChip) => void
  limit?: number | undefined
  onMore?: (() => void) | undefined
}> = ({ model, chips, pressed, onToggle, limit, onMore }) => {
  // The phone peek shows the top few; "N more" opens the full legend.
  const cut = limit !== undefined && chips.length > limit + 1
  const shown = cut ? chips.slice(0, limit) : chips
  return (
    <>
      <div
        className="map-legend__chips"
        role="group"
        aria-label={`${model.title} legend`}
      >
        {shown.map(chip => {
          const value = model.facet?.valueOf(chip) ?? chip.key
          return (
            <button
              key={chip.key}
              type="button"
              className="map-legend__chip"
              aria-pressed={pressed.includes(value)}
              onClick={() => onToggle(chip)}
            >
              <PinSwatch category={chip} />
              {chip.code && (
                <span className="map-legend__code">{chip.code}</span>
              )}{' '}
              <span>{chip.label}</span>{' '}
              <span className="map-legend__count">{chip.count}</span>
            </button>
          )
        })}
        {cut && (
          <button
            type="button"
            className="map-legend__chip map-legend__more"
            onClick={onMore}
          >
            {chips.length - shown.length} more
          </button>
        )}
      </div>
      {/* The full legend explains how clusters summarise their clubs. */}
      {model.kind !== 'categorical' && limit === undefined && (
        <p className="map-legend__note">
          Clusters show the{' '}
          {model.kind === 'ordinal' ? 'middle level' : 'most common status'}
          {pipNote(model)}.
        </p>
      )}
      {model.note && limit === undefined && (
        <p className="map-legend__note">{model.note}</p>
      )}
    </>
  )
}

/** The map's empty states: no club in this snapshot has a location
 *  (enrichment-stripped dates), or, with `to`, the map can't be drawn
 *  on this device and the list view stands in. */
export const MapEmpty: React.FC<{
  onLatest?: (() => void) | undefined
  to?: To
}> = ({ onLatest, to }) =>
  to ? (
    <div className="district-map__empty">
      <p>The map can’t be shown on this device.</p>
      <Link to={to}>Show the clubs as a list</Link>
    </div>
  ) : (
    <div className="district-map__empty">
      <p>
        <strong>No location data for this date</strong>
      </p>
      <p>
        This snapshot has no club locations. The list view still has every club.
      </p>
      {onLatest && (
        <button type="button" className="map-pill" onClick={onLatest}>
          Latest date
        </button>
      )}
    </div>
  )
