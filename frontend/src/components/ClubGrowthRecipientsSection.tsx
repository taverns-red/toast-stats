/**
 * ClubGrowthRecipientsSection (#1537) — who earned the District Club Growth
 * Achievement, worldwide, on `/awards`.
 *
 * TI's rule (announcement, Aug 2026 — rules reference §13.7): charter 3 or 5
 * new clubs by September 30, and 3, 5 or 10 by March 31. A district holds the
 * highest tier it reached (operator ruling A3, #1473). It is a THRESHOLD, not
 * a race: any number of districts can earn it, so there is no rank column and
 * no tie to break — districts are grouped by the tier they reached.
 *
 * Each checkpoint renders one of four distinguishable states and never blurs
 * them: a structural skeleton while loading (Lessons 107/158); an honest
 * "not settled yet" before the deadline — no recipients, no empty table; the
 * recipients, or an explicit "no district reached a milestone"; and a
 * per-reason "not available" (#1501) that is never rendered as zero.
 *
 * Presentation only: `useClubGrowthRecipients` owns which file is read.
 */
import React from 'react'
import { Link } from 'react-router-dom'
import { CLUB_GROWTH_RECOGNITION } from './recognition/recognitionRegistry'
import type {
  ClubGrowthRecipient,
  ClubGrowthRecipientsCheckpoint,
  ClubGrowthRecipientsUnavailableReason,
} from '../hooks/useClubGrowthRecipients'

export interface ClubGrowthRecipientsSectionProps {
  /** `"YYYY-YYYY"`, from the page (R3). */
  programYearLabel: string
  /** Per-checkpoint verdicts from `useClubGrowthRecipients`. */
  checkpoints: readonly ClubGrowthRecipientsCheckpoint[]
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** `2026-09-30` → `September 30, 2026`, parsed from the string (no TZ roll). */
const formatFullDate = (iso: string): string => {
  const month = MONTHS[Number.parseInt(iso.slice(5, 7), 10) - 1]
  if (!month) return iso
  return `${month} ${Number.parseInt(iso.slice(8, 10), 10)}, ${iso.slice(0, 4)}`
}

const UNAVAILABLE_COPY: Record<ClubGrowthRecipientsUnavailableReason, string> =
  {
    'snapshot-missing': 'no snapshot was archived for this checkpoint.',
    'count-absent': 'the checkpoint’s data predates new-club charter counts.',
    'count-not-collected':
      'charter counts were not collected for this checkpoint’s snapshot.',
  }

const clubWord = (n: number) => (n === 1 ? 'club' : 'clubs')
const districtWord = (n: number) => (n === 1 ? 'district' : 'districts')

const Glyph: React.FC = () => {
  const { Icon, id, accentVar } = CLUB_GROWTH_RECOGNITION
  return (
    <span
      aria-hidden="true"
      data-recognition={id}
      className="club-growth-recipients__glyph"
      style={{ color: `var(${accentVar})` }}
    >
      <Icon className="club-growth-recipients__glyph-icon" />
    </span>
  )
}

/** Recipients grouped by the tier they reached, highest tier first. */
const TierGroups: React.FC<{
  recipients: readonly ClubGrowthRecipient[]
  milestones: readonly number[]
  checkpointId: string
}> = ({ recipients, milestones, checkpointId }) => (
  <>
    {[...milestones].reverse().map(milestone => {
      const inTier = recipients.filter(r => r.milestone === milestone)
      if (inTier.length === 0) return null
      const headingId = `club-growth-${checkpointId}-tier-${milestone}`
      return (
        <div
          key={milestone}
          className="club-growth-recipients__tier"
          data-testid={`club-growth-${checkpointId}-tier-${milestone}`}
        >
          <h4 id={headingId} className="club-growth-recipients__tier-heading">
            {milestone}-club milestone · {inTier.length}{' '}
            {districtWord(inTier.length)}
          </h4>
          <ul className="awards-page-card__list" aria-labelledby={headingId}>
            {inTier.map(r => (
              <li
                key={r.districtId}
                className="awards-page-card__row club-growth-recipients__row"
              >
                <span className="awards-page-card__name">
                  <Link
                    to={`/district/${r.districtId}`}
                    className="awards-page-card__district"
                  >
                    {r.districtName}
                  </Link>
                </span>
                <span className="awards-page-card__region">R{r.region}</span>
                <span className="awards-page-card__value">
                  {r.count} new {clubWord(r.count)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    })}
  </>
)

const CheckpointBody: React.FC<{
  checkpoint: ClubGrowthRecipientsCheckpoint
}> = ({ checkpoint }) => {
  const deadline = formatFullDate(checkpoint.checkpointDate)
  switch (checkpoint.status) {
    case 'loading':
      return (
        <p
          className="awards-page-card__empty club-growth-recipients__skeleton"
          data-testid={`club-growth-${checkpoint.id}-loading`}
        >
          Loading this checkpoint’s recipients…
        </p>
      )
    case 'pending':
      return (
        <p className="awards-page-card__empty">
          Not settled yet — this checkpoint closes on {deadline}. Recipients
          appear once the archive reaches that date; until then no district
          holds it.
        </p>
      )
    case 'unavailable':
      return (
        <p
          className="awards-page-card__empty"
          data-testid={`club-growth-${checkpoint.id}-unavailable`}
          data-reason={checkpoint.reason}
        >
          Recipients not available — {UNAVAILABLE_COPY[checkpoint.reason]}
        </p>
      )
    case 'resolved':
      if (checkpoint.recipients.length === 0) {
        return (
          <p className="awards-page-card__empty">
            No district reached a milestone by {deadline}.
          </p>
        )
      }
      return (
        <TierGroups
          recipients={checkpoint.recipients}
          milestones={checkpoint.milestones}
          checkpointId={checkpoint.id}
        />
      )
  }
}

export const ClubGrowthRecipientsSection: React.FC<
  ClubGrowthRecipientsSectionProps
> = ({ programYearLabel, checkpoints }) => {
  const recognition = CLUB_GROWTH_RECOGNITION
  return (
    <section
      id="club-growth-achievement"
      className="awards-page-card club-growth-recipients"
      aria-labelledby="club-growth-recipients-title"
      data-testid="club-growth-recipients"
    >
      <header className="awards-page-card__header">
        <h2
          id="club-growth-recipients-title"
          className="awards-page-card__title"
        >
          <Glyph />
          {recognition.title}
        </h2>
        <p className="awards-page-card__description">
          {recognition.description} A threshold, not a race: every district that
          reaches a milestone earns it, and holds the highest tier it reached.
          Each checkpoint is judged on that date’s own snapshot.
        </p>
        <div className="awards-page-card__meta">
          <span className="club-growth-recipients__py">{programYearLabel}</span>
          <Link
            to={recognition.methodologyHref}
            className="awards-page-card__methodology-link"
          >
            Methodology
          </Link>
        </div>
      </header>
      <div className="club-growth-recipients__checkpoints">
        {checkpoints.map(checkpoint => {
          const titleId = `club-growth-${checkpoint.id}-title`
          const recipientCount =
            checkpoint.status === 'resolved' ? checkpoint.recipients.length : 0
          return (
            <section
              key={checkpoint.id}
              className="club-growth-recipients__checkpoint"
              aria-labelledby={titleId}
              data-testid={`club-growth-recipients-${checkpoint.id}`}
              data-status={checkpoint.status}
            >
              <h3 id={titleId} className="club-growth-recipients__heading">
                By {formatFullDate(checkpoint.checkpointDate)}
                <span className="club-growth-recipients__tiers">
                  {' '}
                  · {checkpoint.milestones.join(' / ')} clubs
                </span>
              </h3>
              {checkpoint.status === 'resolved' && recipientCount > 0 && (
                <p className="awards-page-card__achieved club-growth-recipients__count">
                  ✓ {recipientCount} {districtWord(recipientCount)} achieved
                </p>
              )}
              <CheckpointBody checkpoint={checkpoint} />
              {checkpoint.status === 'resolved' && (
                <p className="club-growth-recipients__provenance">
                  From the {formatFullDate(checkpoint.checkpointDate)} snapshot
                  (data as of {formatFullDate(checkpoint.asOfDate)}).
                </p>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}

export default ClubGrowthRecipientsSection
