import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  EVENING_END_HOUR,
  EVENING_START_HOUR,
  MEETING_MODES,
  MEETING_MODE_LABELS,
  WEEKDAYS,
  hourRangeLabel,
  intensityLevel,
  type MeetingMode,
  type MeetingSelection,
  type MeetingSlot,
} from '../../utils/meetingHeatmap'
import type { MeetingWeekday } from '@taverns-red/shared-contracts'

/* The meeting-time heatmap's building blocks (#1796, shared with the region
   and world pages, #1814): KPI strip, mode switch, evening-gap note, the
   weekday × start-hour grid with its legend, and the data table
   alternative. They render counts only; the page decides what a cell links
   to. Days are columns below 1024 (each cell a ≥44px tap target) and rows
   from 1024 (meetings.css). Every cell prints its count and carries a
   screen-reader value, so colour is never the only signal. */

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
export const pad = (h: number) => String(h).padStart(2, '0')
export const clubsText = (n: number) =>
  n === 0 ? 'no clubs' : n === 1 ? '1 club' : `${n.toLocaleString()} clubs`

/** A link to the current URL with one param set (null = removed). */
export function useParamHref(): (key: string, value: string | null) => string {
  const [params] = useSearchParams()
  return (key, value) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    const s = next.toString()
    return s ? `?${s}` : '?'
  }
}

export const isSlot = (s: MeetingSelection | null): s is MeetingSlot =>
  s !== null && typeof s === 'object'

const sameSlot = (a: MeetingSelection | null, b: MeetingSlot) =>
  isSlot(a) && a.day === b.day && a.hour === b.hour

export function slotTitle(slot: MeetingSlot): string {
  return slot.hour === null
    ? `${slot.day}, time not stated`
    : `${slot.day} ${hourRangeLabel(slot.hour)}`
}

export const modeSuffixOf = (mode: MeetingMode) =>
  mode === 'all' ? '' : ` (${MEETING_MODE_LABELS[mode].toLowerCase()})`

export const MeetingKpis: React.FC<{
  scheduled: number
  totalClubs: number
  inPerson: number
  onlineCapable: number
  /** The "Schedule not stated" value: a link where the page lists them. */
  unknown: React.ReactNode
}> = ({ scheduled, totalClubs, inPerson, onlineCapable, unknown }) => (
  <ul className="meetings-kpis" aria-label="Meetings at a glance">
    <li className="meetings-kpi">
      <span className="meetings-kpi__label">Schedule listed</span>
      <span className="meetings-kpi__value">
        {scheduled.toLocaleString()} of {totalClubs.toLocaleString()}
      </span>
    </li>
    <li className="meetings-kpi">
      <span className="meetings-kpi__label">Meet in person</span>
      <span className="meetings-kpi__value">{inPerson.toLocaleString()}</span>
      <span className="meetings-kpi__hint">incl. hybrid</span>
    </li>
    <li className="meetings-kpi">
      <span className="meetings-kpi__label">Online-capable</span>
      <span className="meetings-kpi__value">
        {onlineCapable.toLocaleString()}
      </span>
      <span className="meetings-kpi__hint">online or hybrid</span>
    </li>
    <li className="meetings-kpi">
      <span className="meetings-kpi__label">Schedule not stated</span>
      {unknown}
    </li>
  </ul>
)

/** All / In person / Online: plain links writing `?mode=` (ADR-005). */
export const MeetingModeSwitch: React.FC<{
  mode: MeetingMode
  href: (key: string, value: string | null) => string
}> = ({ mode, href }) => (
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
)

export const EveningGapsNote: React.FC<{
  gaps: readonly MeetingWeekday[]
  mode: MeetingMode
  children?: React.ReactNode
}> = ({ gaps, mode, children }) => {
  const suffix = modeSuffixOf(mode)
  return (
    <p className="meetings-note" data-testid="meeting-evening-gaps">
      {gaps.length === 0
        ? `Every evening has a club starting between ${pad(EVENING_START_HOUR)}:00 and ${pad(EVENING_END_HOUR)}:00${suffix}.`
        : `No club starts between ${pad(EVENING_START_HOUR)}:00 and ${pad(EVENING_END_HOUR)}:00${suffix} on ${gaps.join(', ')}.`}
      {children}
    </p>
  )
}

export interface MeetingGridProps {
  counts: readonly (readonly number[])[]
  noTime: readonly number[]
  max: number
  mode: MeetingMode
  selection: MeetingSelection | null
  /** Where a cell with clubs links (`?slot=`). */
  cellHref: (slot: MeetingSlot) => string
}

/** The weekday × start-hour grid and its legend. */
export const MeetingGrid: React.FC<MeetingGridProps> = ({
  counts,
  noTime,
  max,
  mode,
  selection,
  cellHref,
}) => {
  const hasNoTime = noTime.some(n => n > 0)
  const cell = (slot: MeetingSlot, count: number, d: number, h: number) => {
    const level = intensityLevel(count, max)
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
        to={cellHref(slot)}
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
    <>
      <div
        className={`meeting-grid${hasNoTime ? ' has-notime' : ''}`}
        role="group"
        aria-label={`Clubs by weekday and start hour${modeSuffixOf(mode)}`}
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
            {HOURS.map(h => cell({ day, hour: h }, counts[d]![h]!, d, h))}
            {hasNoTime && cell({ day, hour: null }, noTime[d]!, d, 24)}
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
    </>
  )
}

/** The data table alternative with every count. */
export const MeetingTable: React.FC<{
  counts: readonly (readonly number[])[]
  noTime: readonly number[]
  mode: MeetingMode
}> = ({ counts, noTime, mode }) => {
  const hasNoTime = noTime.some(n => n > 0)
  return (
    <details className="meetings-table">
      <summary className="meetings-table__summary">Show as a table</summary>
      <div
        className="meetings-table__scroll"
        role="region"
        aria-label="Meeting times table"
        tabIndex={0}
      >
        <table>
          <caption>Clubs by start hour and weekday{modeSuffixOf(mode)}</caption>
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
                  <td key={day}>{counts[d]![h]}</td>
                ))}
              </tr>
            ))}
            {hasNoTime && (
              <tr>
                <th scope="row">Time not stated</th>
                {WEEKDAYS.map((day, d) => (
                  <td key={day}>{noTime[d]}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  )
}
