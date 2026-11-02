import React from 'react'
import {
  deadlinesForProgramYear,
  type ProgramYearDeadline,
} from '../utils/programYearDeadlines'
import { DEADLINES_ICS_PATH } from '../utils/deadlinesIcs'
import { formatShortDate } from '../utils/dateFormatting'

/* Whole-year deadline timeline (#2429): every date of the page's program
   year from the one cited table in `programYearDeadlines.ts`, grouped by
   month. An owner role appears only where a TI document names it, and links
   to that document; a date no source assigns shows no owner. Dates before
   the page's own date (R3) are marked passed. The .ics link is the same
   table, built into the site at build time. */

export interface DeadlineTimelineProps {
  id: string
  /** "YYYY-YYYY", owned by the page (R3). */
  programYear: string
  /** The page's pinned date (`YYYY-MM-DD`). */
  asOfDate: string
}

const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function monthLabel(isoDate: string): string {
  return MONTH.format(new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`))
}

function byMonth(
  list: ProgramYearDeadline[]
): { month: string; items: ProgramYearDeadline[] }[] {
  const groups: { month: string; items: ProgramYearDeadline[] }[] = []
  for (const d of list) {
    const month = d.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(d)
    else groups.push({ month, items: [d] })
  }
  return groups
}

export const DeadlineTimeline: React.FC<DeadlineTimelineProps> = ({
  id,
  programYear,
  asOfDate,
}) => {
  const asOf = asOfDate.slice(0, 10)
  const groups = byMonth(deadlinesForProgramYear(programYear))

  return (
    <div id={id} className="deadline-timeline" data-testid="deadline-timeline">
      {groups.map(group => (
        <section key={group.month} className="deadline-timeline__month">
          <h3 className="deadline-timeline__month-name">
            {monthLabel(group.items[0]!.date)}
          </h3>
          <ul className="deadline-timeline__list">
            {group.items.map(d => {
              const passed = d.date < asOf
              return (
                <li
                  key={d.id}
                  className={
                    passed
                      ? 'deadline-timeline__item deadline-timeline__item--passed'
                      : 'deadline-timeline__item'
                  }
                  title={`Source: ${d.source}`}
                >
                  <time className="deadline-timeline__date" dateTime={d.date}>
                    {formatShortDate(d.date)}
                  </time>
                  <span className="deadline-timeline__body">
                    <span className="deadline-timeline__label">{d.label}</span>
                    {passed && (
                      <span className="deadline-timeline__passed">
                        {' '}
                        · passed
                      </span>
                    )}
                    {d.owner && (
                      <span className="deadline-timeline__owner">
                        Owner: {d.owner.role} (
                        <a
                          href={d.owner.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={d.owner.citation}
                        >
                          {d.owner.short}
                        </a>
                        )
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <p className="deadline-timeline__feed">
        <a href={DEADLINES_ICS_PATH}>Add to calendar (.ics)</a>
        <span className="deadline-timeline__note">
          {' '}
          · Owners are named only where a Toastmasters document does.
        </span>
      </p>
    </div>
  )
}
