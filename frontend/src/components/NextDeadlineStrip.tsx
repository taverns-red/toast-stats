import React, { useId, useState } from 'react'
import { nextDeadlines } from '../utils/programYearDeadlines'
import { formatShortDate } from '../utils/dateFormatting'
import { DeadlineTimeline } from './DeadlineTimeline'

/* Next-deadline strip (#2298): the next two Toastmasters dates of the
   page's program year — officer-training rounds, Club Success Plans, dues
   renewals, Area club-visit reports — counted down from the page's own date.
   Every date comes from the one cited table in `programYearDeadlines.ts`;
   each item's title names its TI source. The program year and date are the
   page's (R3): a past snapshot counts down from the day it shows, while the
   latest data counts from today (#2474) — the page says which.

   While the page date is still resolving the strip keeps its slot with
   placeholder lines, so the content below it does not move on arrival.

   "See all deadlines" (#2429) opens the whole year below the strip. It is
   closed by default. Its 44px box sits beside the lead and the first date on
   phones ("All") and in the lead's row from 768, so the closed phone strip
   is no taller than before (the 375 Overview has ~12px of headroom under its
   4,000px budget). */

export interface NextDeadlineStripProps {
  /** "YYYY-YYYY", owned by the page (R3). */
  programYear: string
  /** The page's pinned date (`YYYY-MM-DD`); undefined while it resolves. */
  asOfDate: string | undefined
  /** True when the page shows its latest data, with no past date picked
   * (#2474). The page decides (R3). */
  isLatest?: boolean
}

function countdown(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return `in ${daysLeft} days`
}

/** "2026-2027" → "2026–27". */
function shortProgramYear(programYear: string): string {
  return `${programYear.slice(0, 4)}–${programYear.slice(7, 9)}`
}

const LEAD = 'Next deadlines'

/** Today's local calendar date as `YYYY-MM-DD`. */
function localToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const NextDeadlineStrip: React.FC<NextDeadlineStripProps> = ({
  programYear,
  asOfDate,
  isLatest = false,
}) => {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (!asOfDate) {
    return (
      <section
        className="deadline-strip deadline-strip--loading"
        aria-label={LEAD}
        aria-busy="true"
        data-testid="next-deadline-strip"
      >
        <div className="deadline-strip__head">
          <span className="deadline-strip__lead">{LEAD}</span>
          {/* Holds the toggle's 44px row so the strip does not grow on
              arrival (#2429). */}
          <span className="deadline-strip__toggle-slot" aria-hidden="true">
            &nbsp;
          </span>
        </div>
        <span className="deadline-strip__placeholder" aria-hidden="true">
          &nbsp;
        </span>
        <span className="deadline-strip__placeholder" aria-hidden="true">
          &nbsp;
        </span>
      </section>
    )
  }

  // Deadlines are calendar facts (#2474): on the latest data count from
  // today, since the latest snapshot can sit at the month end during
  // reconciliation. A picked past date counts from that date.
  const today = localToday()
  const countFrom = isLatest && today > asOfDate ? today : asOfDate
  const upcoming = nextDeadlines(programYear, countFrom)

  return (
    <section
      className="deadline-strip"
      aria-label={LEAD}
      data-testid="next-deadline-strip"
    >
      <div className="deadline-strip__head">
        <span className="deadline-strip__lead">{LEAD}</span>
        <button
          type="button"
          className="deadline-strip__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
          aria-label="See all deadlines"
        >
          <span className="deadline-strip__toggle-short">All</span>
          <span className="deadline-strip__toggle-long">See all deadlines</span>
          <span className="deadline-strip__chevron" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </button>
      </div>
      {upcoming.length === 0 ? (
        <p className="deadline-strip__done">
          Every {shortProgramYear(programYear)} deadline has passed.
        </p>
      ) : (
        <ul className="deadline-strip__list">
          {upcoming.map(d => (
            <li
              key={d.id}
              className="deadline-strip__item"
              title={`Source: ${d.source}`}
            >
              <span className="deadline-strip__label">{d.label}</span>{' '}
              <span className="deadline-strip__when">
                <time dateTime={d.date}>{formatShortDate(d.date)}</time>
                {' · '}
                <span className="deadline-strip__countdown">
                  {countdown(d.daysLeft)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <DeadlineTimeline
          id={panelId}
          programYear={programYear}
          asOfDate={countFrom}
        />
      )}
    </section>
  )
}
