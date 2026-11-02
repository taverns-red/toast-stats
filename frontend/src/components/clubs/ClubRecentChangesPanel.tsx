import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ClubPanel } from './ClubPanel'
import {
  FEED_WINDOW_DAYS,
  formatFeedDate,
  formatFeedWindow,
  type ClubChangeFeed,
} from '../../utils/clubChangeFeed'
import { RENEWAL_DUES_FAQ_URL } from '../../utils/programYearDeadlines'

/**
 * #2430 — "Recent changes" on the club page: what happened to this club, and
 * when. One dated line per change (the What Changed engine's own events),
 * newest first, bounded, then a link to every change in the district for
 * the same dates (What Changed). The page already carries the one link to
 * the club's multi-year history (#1843; the club-page-mobile smoke counts
 * it), so the card does not add a second (PR #2446).
 *
 * A reason shows only where the feed carries one (a membership drop across a
 * dues renewal deadline), and the panel then cites the TI rule it rests on.
 * A window that bridges a missing snapshot says so on its line.
 *
 * While the snapshots load (or before the panel nears the viewport) the list
 * holds skeleton rows of the real row height, so nothing below it shifts.
 * Only an in-flight read sets aria-busy: a card that has not started reading
 * is not busy, or the page would never settle for a reader who stops above
 * it (PR #2446, the club-hero-cls smoke).
 */
const SKELETON_ROWS = 3

function ChangesIcon() {
  return (
    <svg
      className="club-panel__ico"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <path d="M2.5 11.5l3.5-3.5 2.5 2.5 5-5" />
      <path d="M10 5.5h3.5V9" />
    </svg>
  )
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function ClubRecentChangesPanel({
  feed,
  isLoading,
  districtId,
}: {
  /** Null while loading, or while the card waits to be scrolled near. */
  feed: ClubChangeFeed | null
  /** Reads in flight: the only time the card is aria-busy. A card waiting
   *  off-screen holds its skeleton rows but is not busy (PR #2446). */
  isLoading: boolean
  /** The district whose What Changed page holds every change. */
  districtId: string | undefined
}) {
  const ready = !isLoading && feed !== null ? feed : null

  let body: ReactNode
  if (!ready) {
    body = (
      <ol className="club-changes__list" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li key={i} className="club-changes__row club-changes__row--skeleton">
            <span className="club-changes__when">
              <span className="club-changes__bar club-changes__bar--short" />
            </span>
            <span className="club-changes__what">
              <span className="club-changes__bar" />
            </span>
          </li>
        ))}
      </ol>
    )
  } else if (!ready.comparable) {
    body = (
      <p className="club-changes__note">
        Not enough recorded dates in the last {FEED_WINDOW_DAYS} days to
        compare.
      </p>
    )
  } else if (ready.entries.length === 0) {
    body = (
      <p className="club-changes__note">
        No changes recorded between {formatFeedDate(ready.windowStart ?? '')}{' '}
        and {formatFeedDate(ready.windowEnd ?? '')}.
      </p>
    )
  } else {
    body = (
      <ol className="club-changes__list">
        {ready.entries.map(entry => (
          <li
            key={entry.key}
            className={`club-changes__row club-changes__row--${
              entry.magnitude > 0 ? 'up' : entry.magnitude < 0 ? 'down' : 'flat'
            }`}
          >
            <span className="club-changes__when">
              <time dateTime={entry.toDate}>
                {formatFeedWindow(entry.fromDate, entry.toDate)}
              </time>
            </span>
            <span className="club-changes__what">
              <span className="club-changes__text">{entry.text}</span>
              {entry.reason && (
                <span className="club-changes__reason">
                  {entry.reason.text}
                </span>
              )}
              {entry.spansMissingData && (
                <span className="club-changes__gap">
                  Includes a date with no data
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    )
  }

  const missing = ready?.unavailableDates.length ?? 0

  return (
    <ClubPanel
      titleId="club-changes-title"
      title="Recent changes"
      className="club-changes"
      icon={<ChangesIcon />}
      meta={`Last ${FEED_WINDOW_DAYS} days`}
      busy={isLoading}
    >
      {body}
      {ready?.comparable && ready.truncated && (
        <p className="club-changes__note">
          Showing the latest {ready.entries.length} of {ready.totalEvents}{' '}
          changes.
        </p>
      )}
      {ready?.comparable && missing > 0 && (
        <p className="club-changes__note">
          No data for {plural(missing, 'date', 'dates')} in this period; changes
          across {missing === 1 ? 'it are' : 'them are'} shown combined.
        </p>
      )}
      {ready?.hasReasons && (
        <p className="club-changes__note">
          Dues are due April 1 and October 1. Source:{' '}
          <a href={RENEWAL_DUES_FAQ_URL} target="_blank" rel="noreferrer">
            Toastmasters Renewal Dues FAQ
          </a>
          ; Distinguished Club Program (Item 1111), p. 8.
        </p>
      )}
      {ready?.comparable &&
        districtId &&
        ready.windowStart &&
        ready.windowEnd && (
          <p className="club-changes__more">
            <Link
              to={`/district/${districtId}/changes?from=${ready.windowStart}&to=${ready.windowEnd}`}
            >
              Every change in the district,{' '}
              {formatFeedWindow(ready.windowStart, ready.windowEnd)}
            </Link>
          </p>
        )}
    </ClubPanel>
  )
}
