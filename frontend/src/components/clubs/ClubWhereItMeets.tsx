import type { ClubMeetingInfo } from '../../utils/clubMeetingInfo'

/**
 * #1783 — the club hero's "where it meets" line: schedule · mode · place ·
 * website · "Contact on toastmasters.org". Presentational only; the
 * never-email/phone rule is enforced upstream in `buildClubMeetingInfo`,
 * whose output type has no field that could carry either.
 *
 * Renders nothing for `null` (no FAC enrichment for the viewed date).
 * Styled by `.club-meets*` in app-shell.css with `--rt-*` tokens.
 */
export function ClubWhereItMeets({ info }: { info: ClubMeetingInfo | null }) {
  if (!info) return null

  const external = { target: '_blank', rel: 'noopener noreferrer' } as const

  return (
    <ul className="club-meets" aria-label="Where the club meets">
      {info.schedule && (
        <li className="club-meets__item">
          <svg
            className="club-meets__ico"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.5V8l2.5 1.5" />
          </svg>
          <span>{info.schedule}</span>
        </li>
      )}
      {info.mode && (
        <li className="club-meets__item">
          <span>{info.mode}</span>
        </li>
      )}
      {info.place && (
        <li className="club-meets__item">
          <svg
            className="club-meets__ico"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z" />
            <circle cx="8" cy="6.5" r="1.5" />
          </svg>
          <span>{info.place}</span>
        </li>
      )}
      {info.websiteUrl && (
        <li className="club-meets__item">
          <a
            className="club-meets__link"
            href={info.websiteUrl}
            {...external}
            aria-label="Club website (opens in a new tab)"
          >
            Website <span aria-hidden="true">↗</span>
          </a>
        </li>
      )}
      {info.contactUrl && (
        <li className="club-meets__item">
          <a
            className="club-meets__link"
            href={info.contactUrl}
            {...external}
            aria-label="Contact on toastmasters.org (opens in a new tab)"
          >
            Contact on toastmasters.org <span aria-hidden="true">↗</span>
          </a>
        </li>
      )}
    </ul>
  )
}
