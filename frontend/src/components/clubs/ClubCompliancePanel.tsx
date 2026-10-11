import type {
  ClubCoachSummary,
  ComplianceRow,
  ComplianceState,
} from '../../utils/clubCompliance'

/**
 * #1790 — Compliance panel on the club page. A row list, not a table
 * (mobile review 2026-10-11 §6.3): label + status on one line, the source
 * and its as-of date as secondary text. State is carried by a glyph and the
 * status words, with colour only as reinforcement; nothing is hover-only.
 */
const GLYPH: Record<ComplianceState, string> = {
  ok: '✓',
  warn: '!',
  bad: '✗',
  neutral: '–',
  unknown: '?',
}

export function ClubCompliancePanel({
  rows,
  coach,
}: {
  rows: ComplianceRow[]
  /** Null when the viewed date has no coaches report. */
  coach: ClubCoachSummary | null
}) {
  const coachRow: ComplianceRow = coach
    ? {
        key: 'coach',
        label: 'Coach',
        state: coach.status === 'none' ? 'neutral' : 'ok',
        value: coach.label,
        source: coach.source,
      }
    : {
        key: 'coach',
        label: 'Coach',
        state: 'unknown',
        value: 'Not available for this date',
        source: '',
      }

  return (
    <section
      className="club-panel club-compliance"
      aria-labelledby="club-compliance-title"
    >
      <div className="club-panel__head">
        <h2 id="club-compliance-title">
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
            <path d="M4 2.5h8v11H4z" />
            <path d="M6 6l1.3 1.3L10 4.7M6 10h4" />
          </svg>
          Compliance
        </h2>
      </div>
      <div className="club-panel__body">
        <ul className="club-compliance__list">
          {[...rows, coachRow].map(row => (
            <li
              key={row.key}
              className={`club-compliance__row club-compliance__row--${row.state}`}
            >
              <span className="club-compliance__glyph" aria-hidden="true">
                {GLYPH[row.state]}
              </span>
              <div className="club-compliance__text">
                <div className="club-compliance__line">
                  <span className="club-compliance__label">{row.label}</span>
                  <span className="club-compliance__value">{row.value}</span>
                </div>
                {row.source && (
                  <div className="club-compliance__source">{row.source}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
