import React from 'react'
import { Link } from 'react-router-dom'
import type {
  ClubTrend,
  ProspectiveClub,
} from '../../hooks/useDistrictAnalytics'
import type { LegendChip, ModeModel } from './pinModes'
import { PinSwatch } from './PinSwatch'

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
}> = ({ unmapped, prospective, districtId }) => (
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
  </>
)

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
  )
}
