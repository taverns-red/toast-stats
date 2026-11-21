/* #3111 (DRAFT for Ron, not to ship until he approves the copy) — the five
   renewal periods a suspended or closed club can reinstate in.

   Period 1 is the period the club is suspended in, periods 2 to 5 it is
   closed (Ron, 2026-11-20, #3103). The periods come from the pipeline's
   `lastChanceBy` and `inactivePeriod` (`classifyReinstatement`, R3); this
   view only draws them.

   - The club's period says "Now" in text and carries aria-current; the
     tint is never the only signal.
   - The last-chance line names the date; a heavy rule on period 5 marks
     where the window closes. On the club page the line comes first, the
     answer before the detail (review of 09bb8f19c).
   - Screen readers get one sentence first ("Period 5 of 5, last chance
     March 31, 2027.").
   - 768px and up: one row of five. Phones: one line per period
     (reinstate-window.css). Legacy tokens only (#2080).

   A row with no `inactivePeriod` (placed from lastSeen alone), or one
   outside 1 to 5, gets no period UI at all. */

import type { ReinstatableClub } from '@taverns-red/shared-contracts'
import { formatLongDate } from '../utils/dateFormatting'
import {
  EXAMPLE_LAST_CHANCE,
  EXAMPLE_SUSPENDED_AT,
  isWindowPeriod,
  reinstateWindowPeriods,
  reinstateWindowSummary,
} from '../utils/reinstateWindow'

/** Approved by Ron, 2026-11-20. */
const STATUS_LABEL = {
  suspended: 'Suspended',
  closed: 'Closed, can still reinstate',
} as const

export interface ReinstateWindowProps {
  /** The last day of period 5, ISO (the row's `lastChanceBy`). */
  lastChanceBy: string
  /** The club's period on the snapshot date. Absent: no "Now" marker. */
  inactivePeriod?: number | undefined
  /** Visible caption above the periods (the generic version). */
  caption?: string | undefined
  /** The last-chance line above the periods instead of below them. */
  lastChanceFirst?: boolean | undefined
}

export function ReinstateWindow({
  lastChanceBy,
  inactivePeriod,
  caption,
  lastChanceFirst = false,
}: ReinstateWindowProps) {
  const periods = reinstateWindowPeriods(lastChanceBy)
  if (!periods) return null
  if (inactivePeriod !== undefined && !isWindowPeriod(inactivePeriod)) {
    return null
  }
  const end = (
    <p
      className={`reinstate-window__end${
        lastChanceFirst ? ' reinstate-window__end--first' : ''
      }`}
      data-testid="reinstate-window-end"
    >
      Last chance: {formatLongDate(lastChanceBy)}
    </p>
  )
  return (
    <figure className="reinstate-window" data-testid="reinstate-window">
      {caption && (
        <figcaption className="reinstate-window__caption">{caption}</figcaption>
      )}
      {inactivePeriod !== undefined && (
        <p className="sr-only">
          {reinstateWindowSummary(inactivePeriod, lastChanceBy)}
        </p>
      )}
      {lastChanceFirst && end}
      <ol className="reinstate-window__periods">
        {periods.map(p => {
          const now = p.number === inactivePeriod
          return (
            <li
              key={p.number}
              className={`reinstate-window__period reinstate-window__period--${p.status}${
                now ? ' reinstate-window__period--now' : ''
              }`}
              aria-current={now ? 'step' : undefined}
            >
              <span className="reinstate-window__num">Period {p.number}</span>
              <span className="reinstate-window__range">{p.range}</span>
              <span className="reinstate-window__status">
                {STATUS_LABEL[p.status]}
              </span>
              {now && <strong className="reinstate-window__now">Now</strong>}
            </li>
          )
        })}
      </ol>
      {!lastChanceFirst && end}
    </figure>
  )
}

/** The generic version under the Can reinstate intro: no club, no "Now",
 *  closed by default so the list stays near the top (review of 09bb8f19c). */
export function ReinstateWindowExample() {
  return (
    <details className="growth-reinstate__fold reinstate-window-example">
      <summary className="growth-reinstate__summary">
        How the five periods work
      </summary>
      <ReinstateWindow
        lastChanceBy={EXAMPLE_LAST_CHANCE}
        caption={`Example: a club suspended ${formatLongDate(EXAMPLE_SUSPENDED_AT)}`}
      />
    </details>
  )
}

/** The club page panel, for a suspended or closed club the pipeline gives
 *  a period. Nothing for a club not in the list or with no period. Not
 *  collapsible: for these clubs it is what's next. */
export function ClubReinstateWindow({
  club,
}: {
  club: ReinstatableClub | undefined
}) {
  if (!isWindowPeriod(club?.inactivePeriod) || !club?.lastChanceBy) {
    return null
  }
  if (!reinstateWindowPeriods(club.lastChanceBy)) return null
  return (
    <section
      className="club-panel reinstate-window-panel"
      aria-labelledby="reinstate-window-title"
      data-testid="club-reinstate-window"
    >
      <div className="club-panel__head">
        <h2 id="reinstate-window-title">Time left to reinstate</h2>
      </div>
      <div className="club-panel__body">
        <ReinstateWindow
          lastChanceBy={club.lastChanceBy}
          inactivePeriod={club.inactivePeriod}
          lastChanceFirst
        />
      </div>
    </section>
  )
}

export default ReinstateWindow
