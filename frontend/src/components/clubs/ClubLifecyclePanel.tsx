import type { ReactNode } from 'react'
import { ClubPanel } from './ClubPanel'
import type { ClubLifecycle } from '../../utils/clubLifecycle'

/**
 * #1843 — Lifecycle panel on the club page: a vertical timeline (mobile
 * review §6.3), not the study sketch's horizontal rail. An ordered list, one
 * row per event, oldest first; a rail and dots are decoration (aria-hidden).
 * The current district says so in words and carries `aria-current`, so the
 * accent dot is never the only signal. A current-state row has no date, so
 * it reads "Current" alone.
 *
 * #2169 — when the charter predates the district's earliest snapshot, a
 * muted note under the timeline says where our records start.
 *
 * While the club-district history shard loads, the list holds three skeleton
 * rows of the real row height (structural, not measured), so the panels
 * below do not jump when it lands.
 */
const SKELETON_ROWS = 3

function LifecycleIcon() {
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
      <path d="M5 2.5v11" />
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <path d="M8.5 4h5M8.5 12h5" />
    </svg>
  )
}

export function ClubLifecyclePanel({
  lifecycle,
  isLoading,
}: {
  /** Null while its inputs load. */
  lifecycle: ClubLifecycle | null
  isLoading: boolean
}) {
  const loading = isLoading || lifecycle === null
  const events = lifecycle?.events ?? []

  let body: ReactNode
  if (loading) {
    body = (
      <ol className="club-lifecycle__list" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li
            key={i}
            className="club-lifecycle__row club-lifecycle__row--skeleton"
          >
            <span className="club-lifecycle__dot" />
            <span className="club-lifecycle__text">
              <span className="club-lifecycle__bar" />
            </span>
          </li>
        ))}
      </ol>
    )
  } else if (events.length === 0) {
    body = (
      <p className="club-lifecycle__note">
        Lifecycle details are not available for this club.
      </p>
    )
  } else {
    body = (
      <>
        <ol className="club-lifecycle__list">
          {events.map(event => (
            <li
              key={event.key}
              className={`club-lifecycle__row club-lifecycle__row--${event.kind}${
                event.current ? ' club-lifecycle__row--current' : ''
              }`}
              aria-current={event.current ? 'true' : undefined}
            >
              <span className="club-lifecycle__dot" aria-hidden="true" />
              <span className="club-lifecycle__text">
                <span className="club-lifecycle__title">{event.title}</span>
                <span className="club-lifecycle__when">
                  {event.when}
                  {event.current && (
                    <span className="club-lifecycle__now">
                      {event.when ? ' · Current' : 'Current'}
                    </span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {lifecycle?.recordsStart ? (
          <p className="club-lifecycle__note">
            Our records start in {lifecycle.recordsStart}
          </p>
        ) : null}
        {lifecycle?.formerNames.length ? (
          <p className="club-lifecycle__note">
            Formerly {lifecycle.formerNames.join(', ')}
          </p>
        ) : null}
        {!lifecycle?.historyAvailable && (
          <p className="club-lifecycle__note">
            District history is not available for this club.
          </p>
        )}
      </>
    )
  }

  return (
    <ClubPanel
      titleId="club-lifecycle-title"
      title="Lifecycle"
      className="club-lifecycle"
      icon={<LifecycleIcon />}
      busy={loading}
    >
      {body}
    </ClubPanel>
  )
}
