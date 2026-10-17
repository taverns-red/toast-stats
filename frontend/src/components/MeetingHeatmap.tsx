import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  EVENING_END_HOUR,
  EVENING_START_HOUR,
  MEETING_MODES,
  MEETING_MODE_LABELS,
  WEEKDAYS,
  buildMeetingHeatmap,
  clubsForSelection,
  entriesInSlot,
  describeMeetingEntry,
  hourRangeLabel,
  intensityLevel,
  meetingFilterToken,
  slotKey,
  type MeetingClub,
  type MeetingMode,
  type MeetingSelection,
  type MeetingSlot,
} from '../utils/meetingHeatmap'

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

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad = (h: number) => String(h).padStart(2, '0')
const clubsText = (n: number) =>
  n === 0 ? 'no clubs' : n === 1 ? '1 club' : `${n.toLocaleString()} clubs`

function useParamHref(): (key: string, value: string | null) => string {
  const [params] = useSearchParams()
  return (key, value) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    const s = next.toString()
    return s ? `?${s}` : '?'
  }
}

const isSlot = (s: MeetingSelection | null): s is MeetingSlot =>
  s !== null && typeof s === 'object'

const sameSlot = (a: MeetingSelection | null, b: MeetingSlot) =>
  isSlot(a) && a.day === b.day && a.hour === b.hour

function slotTitle(slot: MeetingSlot): string {
  return slot.hour === null
    ? `${slot.day}, time not stated`
    : `${slot.day} ${hourRangeLabel(slot.hour)}`
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
  const hasNoTime = map.noTime.some(n => n > 0)
  const modeLabel = MEETING_MODE_LABELS[mode]
  const modeSuffix = mode === 'all' ? '' : ` (${modeLabel.toLowerCase()})`

  const cell = (slot: MeetingSlot, count: number, d: number, h: number) => {
    const level = intensityLevel(count, map.max)
    const label = `${slotTitle(slot)}: ${clubsText(count)}`
    const className = `meeting-cell meeting-cell--l${level}${
      sameSlot(selection, slot) ? ' is-selected' : ''
    }`
    const style = { '--d': d + 1, '--h': h + 1 } as React.CSSProperties
    if (count === 0)
      return (
        <span
          key={`${d}-${h}`}
          className={className}
          style={style}
          role="img"
          aria-label={label}
          data-testid="meeting-cell"
        />
      )
    return (
      <Link
        key={`${d}-${h}`}
        to={href('slot', slotKey(slot))}
        replace
        preventScrollReset
        className={className}
        style={style}
        aria-label={label}
        aria-current={sameSlot(selection, slot) ? 'true' : undefined}
        data-testid="meeting-cell"
      >
        <span aria-hidden="true">{count}</span>
      </Link>
    )
  }

  return (
    <section className="meetings-page" aria-labelledby="meetings-title">
      <h2 id="meetings-title" className="meetings-page__title">
        Meeting times
      </h2>
      <p className="meetings-page__subtitle">
        When the district&rsquo;s clubs meet, by weekday and start hour, from
        each club&rsquo;s Find-a-Club listing. Pick a cell for its clubs.
      </p>

      <ul className="meetings-kpis" aria-label="Meetings at a glance">
        <li className="meetings-kpi">
          <span className="meetings-kpi__label">Schedule listed</span>
          <span className="meetings-kpi__value">
            {map.scheduled.toLocaleString()} of{' '}
            {map.totalClubs.toLocaleString()}
          </span>
        </li>
        <li className="meetings-kpi">
          <span className="meetings-kpi__label">Meet in person</span>
          <span className="meetings-kpi__value">
            {map.inPerson.toLocaleString()}
          </span>
          <span className="meetings-kpi__hint">incl. hybrid</span>
        </li>
        <li className="meetings-kpi">
          <span className="meetings-kpi__label">Online-capable</span>
          <span className="meetings-kpi__value">
            {map.onlineCapable.toLocaleString()}
          </span>
          <span className="meetings-kpi__hint">online or hybrid</span>
        </li>
        <li className="meetings-kpi">
          <span className="meetings-kpi__label">Schedule not stated</span>
          {map.unknown.length > 0 ? (
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
          )}
        </li>
      </ul>

      <nav aria-label="How clubs meet" className="meetings-switch">
        {MEETING_MODES.map(m => (
          <Link
            key={m}
            to={href('mode', m === 'all' ? null : m)}
            replace
            preventScrollReset
            aria-current={m === mode ? 'true' : undefined}
            className={`meetings-switch__link${m === mode ? ' is-current' : ''}`}
          >
            {MEETING_MODE_LABELS[m]}
          </Link>
        ))}
      </nav>

      <p className="meetings-note" data-testid="meeting-evening-gaps">
        {map.eveningGaps.length === 0
          ? `Every evening has a club starting between ${pad(EVENING_START_HOUR)}:00 and ${pad(EVENING_END_HOUR)}:00${modeSuffix}.`
          : `No club starts between ${pad(EVENING_START_HOUR)}:00 and ${pad(EVENING_END_HOUR)}:00${modeSuffix} on ${map.eveningGaps.join(', ')}.`}
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
      </p>

      <div
        className={`meeting-grid${hasNoTime ? ' has-notime' : ''}`}
        role="group"
        aria-label={`Clubs by weekday and start hour${modeSuffix}`}
      >
        {WEEKDAYS.map((day, d) => (
          <span
            key={day}
            className="meeting-grid__day"
            style={{ '--d': d + 1 } as React.CSSProperties}
            aria-hidden="true"
          >
            {DAY_SHORT[d]}
          </span>
        ))}
        {HOURS.map(h => (
          <span
            key={h}
            className="meeting-grid__hour"
            style={{ '--h': h + 1 } as React.CSSProperties}
            aria-hidden="true"
          >
            {pad(h)}
          </span>
        ))}
        {hasNoTime && (
          <span
            className="meeting-grid__hour meeting-grid__hour--notime"
            style={{ '--h': 25 } as React.CSSProperties}
            aria-hidden="true"
          >
            ?
          </span>
        )}
        {WEEKDAYS.map((day, d) => (
          <React.Fragment key={day}>
            {HOURS.map(h => cell({ day, hour: h }, map.counts[d]![h]!, d, h))}
            {hasNoTime && cell({ day, hour: null }, map.noTime[d]!, d, 24)}
          </React.Fragment>
        ))}
      </div>

      <div className="meetings-legend" aria-hidden="true">
        <span>Fewer</span>
        {[1, 2, 3, 4].map(l => (
          <span
            key={l}
            className={`meetings-legend__swatch meeting-cell--l${l}`}
          />
        ))}
        <span>More clubs</span>
        <span className="meetings-legend__note">
          Hour = start time{hasNoTime ? ' · ? = time not stated' : ''}
        </span>
      </div>

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

      <details className="meetings-table">
        <summary className="meetings-table__summary">Show as a table</summary>
        <div
          className="meetings-table__scroll"
          role="region"
          aria-label="Meeting times table"
          tabIndex={0}
        >
          <table>
            <caption>Clubs by start hour and weekday{modeSuffix}</caption>
            <thead>
              <tr>
                <th scope="col">Start</th>
                {WEEKDAYS.map((day, d) => (
                  <th key={day} scope="col">
                    <abbr title={day}>{DAY_SHORT[d]}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map(h => (
                <tr key={h}>
                  <th scope="row">{pad(h)}:00</th>
                  {WEEKDAYS.map((day, d) => (
                    <td key={day}>{map.counts[d]![h]}</td>
                  ))}
                </tr>
              ))}
              {hasNoTime && (
                <tr>
                  <th scope="row">Time not stated</th>
                  {WEEKDAYS.map((day, d) => (
                    <td key={day}>{map.noTime[d]}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
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
