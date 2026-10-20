import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  MEETING_MODE_LABELS,
  buildMeetingHeatmap,
  clubsForSelection,
  entriesInSlot,
  describeMeetingEntry,
  meetingFilterToken,
  slotKey,
  type MeetingClub,
  type MeetingMode,
  type MeetingSelection,
} from '../utils/meetingHeatmap'
import {
  EveningGapsNote,
  MeetingGrid,
  MeetingKpis,
  MeetingModeSwitch,
  MeetingTable,
  clubsText,
  isSlot,
  slotTitle,
  useParamHref,
} from './meetings/MeetingHeatmapParts'

/* District meeting-time heatmap body (#1796, epic #1781).

   - KPI strip: clubs with a parsed schedule (of all clubs), in person,
     online-capable, and "schedule not stated" as a link to those clubs.
   - Mode switch (All / In person / Online): plain links writing `?mode=`,
     no tabs (ADR-005).
   - Grid: weekday × start hour, intensity = distinct clubs. Days are columns
     below 1024 (so each cell is a ≥44px tap target) and rows from 1024. A cell
     with clubs is a link writing `?slot=`; every cell prints its count and
     carries a screen-reader value, so colour is never the only signal.
   - The selected cell's clubs, each linked to its club page, and "Show on
     the map" → `/district/:id/map?meets=` (same predicate, same clubs).
   - A data table alternative with every count.

   Mode and selection come from the page (URL-parsed there); the program year
   and date for the map link come from the page controls (R3). */

export interface MeetingHeatmapProps {
  clubs: readonly MeetingClub[]
  districtId: string
  mode: MeetingMode
  selection: MeetingSelection | null
  /** The page's PY / date params, carried onto the map link (R3). */
  mapContext: { py?: string; date?: string }
}

export const MeetingHeatmap: React.FC<MeetingHeatmapProps> = ({
  clubs,
  districtId,
  mode,
  selection,
  mapContext,
}) => {
  const href = useParamHref()
  const map = useMemo(() => buildMeetingHeatmap(clubs, mode), [clubs, mode])

  return (
    <section className="meetings-page" aria-labelledby="meetings-title">
      <h2 id="meetings-title" className="meetings-page__title">
        Meeting times
      </h2>
      <p className="meetings-page__subtitle">
        When the district&rsquo;s clubs meet, by weekday and start hour, from
        each club&rsquo;s Find-a-Club listing. Pick a cell for its clubs.
      </p>

      <MeetingKpis
        scheduled={map.scheduled}
        totalClubs={map.totalClubs}
        inPerson={map.inPerson}
        onlineCapable={map.onlineCapable}
        unknown={
          map.unknown.length > 0 ? (
            <Link
              to={href('slot', 'unknown')}
              replace
              preventScrollReset
              className="meetings-kpi__value meetings-kpi__link"
              aria-label={`${clubsText(map.unknown.length)}: schedule not stated`}
            >
              {map.unknown.length.toLocaleString()}
            </Link>
          ) : (
            <span className="meetings-kpi__value">0</span>
          )
        }
      />

      <MeetingModeSwitch mode={mode} href={href} />

      <EveningGapsNote gaps={map.eveningGaps} mode={mode}>
        {map.modeNotStated.length > 0 && (
          <>
            {' '}
            <Link
              to={href('slot', 'nomode')}
              replace
              preventScrollReset
              className="meetings-note__link"
            >
              {clubsText(map.modeNotStated.length)} don&rsquo;t say how they
              meet
            </Link>{' '}
            and are left out of this view.
          </>
        )}
      </EveningGapsNote>

      <MeetingGrid
        counts={map.counts}
        noTime={map.noTime}
        max={map.max}
        mode={mode}
        selection={selection}
        cellHref={slot => href('slot', slotKey(slot))}
      />

      {selection && (
        <SelectionPanel
          clubs={clubs}
          districtId={districtId}
          mode={mode}
          selection={selection}
          mapContext={mapContext}
          clearHref={href('slot', null)}
        />
      )}

      <MeetingTable counts={map.counts} noTime={map.noTime} mode={mode} />
    </section>
  )
}

const SelectionPanel: React.FC<{
  clubs: readonly MeetingClub[]
  districtId: string
  mode: MeetingMode
  selection: MeetingSelection
  mapContext: { py?: string; date?: string }
  clearHref: string
}> = ({ clubs, districtId, mode, selection, mapContext, clearHref }) => {
  const listed = clubsForSelection(clubs, selection, mode)
  const title =
    selection === 'unknown'
      ? 'Schedule not stated'
      : selection === 'nomode'
        ? 'How they meet not stated'
        : `${slotTitle(selection)}${mode === 'all' ? '' : ` · ${MEETING_MODE_LABELS[mode]}`}`
  const mapHref = (() => {
    if (!isSlot(selection)) return null
    const p = new URLSearchParams()
    p.set('meets', meetingFilterToken(selection, mode))
    if (mapContext.py) p.set('py', mapContext.py)
    if (mapContext.date) p.set('date', mapContext.date)
    return `/district/${districtId}/map?${p.toString()}`
  })()

  return (
    <section
      className="meetings-selection"
      aria-labelledby="meetings-selection-title"
      aria-live="polite"
    >
      <div className="meetings-selection__head">
        <h3 id="meetings-selection-title" className="meetings-selection__title">
          {title} · {clubsText(listed.length)}
        </h3>
        <div className="meetings-selection__actions">
          {mapHref && listed.length > 0 && (
            <Link to={mapHref} className="meetings-selection__action">
              Show on the map
            </Link>
          )}
          <Link
            to={clearHref}
            replace
            preventScrollReset
            className="meetings-selection__action"
          >
            Clear
          </Link>
        </div>
      </div>
      {selection === 'unknown' && (
        <p className="meetings-note">
          Their Find-a-Club meeting day names no weekday, so they are counted
          here rather than in the grid.
        </p>
      )}
      {listed.length === 0 ? (
        <p className="meetings-note">No clubs.</p>
      ) : (
        <ul className="meetings-selection__list">
          {listed.map(c => (
            <li key={c.clubId} className="meetings-selection__item">
              <Link
                to={`/district/${districtId}/club/${c.clubId}`}
                className="meetings-selection__club"
              >
                {c.clubName}
              </Link>
              <span className="meetings-selection__meta">
                {(isSlot(selection)
                  ? entriesInSlot(c, selection, mode)
                  : (c.meetingSchedule ?? [])
                )
                  .map(describeMeetingEntry)
                  .join('; ')}
              </span>
              <span className="meetings-selection__meta">
                {[c.divisionName, c.areaName].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
