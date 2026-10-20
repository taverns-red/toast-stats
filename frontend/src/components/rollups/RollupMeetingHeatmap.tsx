import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  MEETING_MODE_LABELS,
  WEEKDAYS,
  slotKey,
  type MeetingMode,
  type MeetingSelection,
} from '../../utils/meetingHeatmap'
import {
  aggregateMeetingTimes,
  meetingTimesChildren,
  type ScopedMeetingTimes,
} from '../../utils/meetingTimesRollup'
import {
  EveningGapsNote,
  MeetingGrid,
  MeetingKpis,
  MeetingModeSwitch,
  MeetingTable,
} from '../meetings/MeetingHeatmapParts'
import {
  clubsText,
  isSlot,
  slotTitle,
  useParamHref,
} from '../meetings/meetingHeatmapView'

/* Region and world meeting-time heatmap body (#1814, epic #1781).

   The district page's grid (#1796), summed over the scope's districts from
   `meeting-times.json`: the same KPI strip, mode switch, evening-gap note,
   grid, legend and table. Region and world have counts, not club lists, so
   a cell lists the next level down (a region's districts, the world's
   regions) with their count in that cell, busiest first, each linking to
   its own meetings page with the same cell and mode. A breakdown table and
   a filter (`?district=` / `?region=`, whitelisted by the page) narrow the
   grid. Hours are each club's local start time, stated on the page. Mode,
   cell and filter are URL state the page parses (R3). */

export interface RollupMeetingHeatmapProps {
  scoped: ScopedMeetingTimes
  /** Districts whose counts could not be read (left out of every sum). */
  unreadable: readonly string[]
  mode: MeetingMode
  selection: MeetingSelection | null
}

/** The page's own params a link down keeps (R3). */
const KEPT_PARAMS = ['py', 'date', 'mode'] as const

export const RollupMeetingHeatmap: React.FC<RollupMeetingHeatmapProps> = ({
  scoped,
  unreadable,
  mode,
  selection,
}) => {
  const href = useParamHref()
  const [params, setParams] = useSearchParams()
  const slot = isSlot(selection) ? selection : null
  const sum = useMemo(
    () => aggregateMeetingTimes(scoped.districts, mode),
    [scoped, mode]
  )
  const children = useMemo(
    () => meetingTimesChildren(scoped, mode, slot),
    [scoped, mode, slot]
  )
  const isRegion = scoped.scope.kind === 'region'
  const childNoun = isRegion ? 'district' : 'region'
  const filterParam = isRegion ? 'district' : 'region'

  const downHref = (to: string, withSlot: boolean) => {
    const next = new URLSearchParams()
    for (const key of KEPT_PARAMS) {
      const v = params.get(key)
      if (v) next.set(key, v)
    }
    if (withSlot && slot) next.set('slot', slotKey(slot))
    const s = next.toString()
    return s ? `${to}?${s}` : to
  }

  const onFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(params)
    if (e.target.value) next.set(filterParam, e.target.value)
    else next.delete(filterParam)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const inSlot = children.filter(c => (c.inSlot ?? 0) > 0)
  const slotDay = slot ? WEEKDAYS.indexOf(slot.day) : -1
  const slotTotal = !slot
    ? 0
    : slot.hour === null
      ? sum.noTime[slotDay]!
      : sum.counts[slotDay]![slot.hour]!

  return (
    <section className="meetings-page" aria-labelledby="meetings-title">
      <h2 id="meetings-title" className="meetings-page__title">
        Meeting times
      </h2>
      <p className="meetings-page__subtitle">
        When clubs meet, by weekday and start hour, from each club&rsquo;s
        Find-a-Club listing, summed over the{' '}
        {isRegion ? 'region’s districts' : 'world’s districts'}. Pick a cell for
        its {childNoun}s.
      </p>
      <p className="meetings-note" data-testid="meetings-time-basis">
        Times are each club&rsquo;s local time, as its listing states it. Clubs
        in different time zones are counted at their own hour, so 19:00 means 7
        pm where the club meets.
      </p>

      <div className="meetings-filter">
        <label className="meetings-filter__label" htmlFor="meetings-filter">
          {isRegion ? 'District' : 'Region'}
        </label>
        <select
          id="meetings-filter"
          className="meetings-filter__select"
          value={scoped.filter ?? ''}
          onChange={onFilter}
        >
          <option value="">{isRegion ? 'All districts' : 'All regions'}</option>
          {scoped.options.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <MeetingKpis
        scheduled={sum.scheduled}
        totalClubs={sum.clubs}
        inPerson={sum.inPerson}
        onlineCapable={sum.onlineCapable}
        unknown={
          <span className="meetings-kpi__value">
            {(sum.clubs - sum.scheduled).toLocaleString()}
          </span>
        }
      />

      <MeetingModeSwitch mode={mode} href={href} />

      <EveningGapsNote gaps={sum.eveningGaps} mode={mode}>
        {sum.modeNotStated > 0 && (
          <>
            {' '}
            {clubsText(sum.modeNotStated)} don&rsquo;t say how they meet and are
            left out of this view.
          </>
        )}
      </EveningGapsNote>

      {unreadable.length > 0 && (
        <p className="meetings-note" data-testid="meetings-unreadable">
          Meeting counts for {unreadable.map(id => `District ${id}`).join(', ')}{' '}
          could not be read and are left out of every total on this page.
        </p>
      )}

      <MeetingGrid
        counts={sum.counts}
        noTime={sum.noTime}
        max={sum.max}
        mode={mode}
        selection={slot}
        cellHref={s => href('slot', slotKey(s))}
      />

      {slot && (
        <section
          className="meetings-selection"
          aria-labelledby="meetings-selection-title"
          aria-live="polite"
        >
          <div className="meetings-selection__head">
            <h3
              id="meetings-selection-title"
              className="meetings-selection__title"
            >
              {slotTitle(slot)}
              {mode === 'all' ? '' : ` · ${MEETING_MODE_LABELS[mode]}`} ·{' '}
              {clubsText(slotTotal)}
            </h3>
            <div className="meetings-selection__actions">
              <Link
                to={href('slot', null)}
                replace
                preventScrollReset
                className="meetings-selection__action"
              >
                Clear
              </Link>
            </div>
          </div>
          {inSlot.length === 0 ? (
            <p className="meetings-note">No clubs.</p>
          ) : (
            <ul className="meetings-selection__list">
              {inSlot.map(c => (
                <li key={c.id} className="meetings-selection__item">
                  {c.to ? (
                    <Link
                      to={downHref(c.to, true)}
                      className="meetings-selection__club"
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span className="meetings-selection__club meetings-selection__club--plain">
                      {c.label}
                    </span>
                  )}
                  <span className="meetings-selection__meta">
                    {clubsText(c.inSlot ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div
        className="meetings-breakdown"
        role="region"
        aria-label={`Meeting times by ${childNoun}`}
        tabIndex={0}
      >
        <table>
          <caption>By {childNoun}</caption>
          <thead>
            <tr>
              <th scope="col">{isRegion ? 'District' : 'Region'}</th>
              <th scope="col">Clubs</th>
              <th scope="col">Schedule listed</th>
              <th scope="col">In person</th>
              <th scope="col">Online-capable</th>
            </tr>
          </thead>
          <tbody>
            {children.map(c => (
              <tr key={c.id}>
                <th scope="row">
                  {c.to ? (
                    <Link to={downHref(c.to, false)}>{c.label}</Link>
                  ) : (
                    c.label
                  )}
                </th>
                <td>{c.clubs.toLocaleString()}</td>
                <td>{c.scheduled.toLocaleString()}</td>
                <td>{c.inPerson.toLocaleString()}</td>
                <td>{c.onlineCapable.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MeetingTable counts={sum.counts} noTime={sum.noTime} mode={mode} />
    </section>
  )
}

export default RollupMeetingHeatmap
