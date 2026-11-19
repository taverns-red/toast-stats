/**
 * MembershipRetentionCard (#1614): the President's Membership Retention Award
 * on /awards, as a Toast Stats estimate.
 *
 * TI names the top 3 districts by "the highest membership retention rate at
 * year-end" (Item 1490 Rev. 07/2026, p. 17) but does not publish the formula.
 * Our estimate is April renewals out of October + late renewals + new and
 * charter members as of the March 31 close (MembershipRetentionCalculator in
 * analytics-core). The card says so in text, with a tag and a footnote.
 *
 * States: not started (before April), so far (April to June), final (June 30)
 * and not available (no March baseline, or a status this build doesn't
 * know). Not available never renders zeros.
 *
 * The file is read without schema validation, so the props are treated as
 * untrusted: an unknown status or missing standings read as not available.
 */
import React from 'react'
import { Link } from 'react-router-dom'
import { DistrictLinkText } from './DistrictLinkText'
import { tiedWinnerIds, TIE_BREAK_UNPUBLISHED } from '../utils/awardTies'
import type {
  MembershipRetentionAward,
  MembershipRetentionStanding,
} from '../services/cdn'

export interface MembershipRetentionCardProps {
  award: MembershipRetentionAward
}

const MEMBERSHIP_RETENTION_METHODOLOGY_HREF =
  '/methodology#membership-retention-award'

const MAX_ROWS = 10

const count = (n: number) => n.toLocaleString('en-US')

type View =
  | { kind: 'not-started' }
  | { kind: 'unavailable' }
  | { kind: 'standings'; final: boolean; rows: MembershipRetentionStanding[] }

function viewOf(award: MembershipRetentionAward): View {
  if (award.status === 'not-started') return { kind: 'not-started' }
  const rows = Array.isArray(award.standings) ? award.standings : []
  if (
    (award.status === 'in-progress' || award.status === 'final') &&
    rows.length > 0
  ) {
    return {
      kind: 'standings',
      final: award.status === 'final',
      rows: rows.slice(0, MAX_ROWS),
    }
  }
  return { kind: 'unavailable' }
}

export const MembershipRetentionCard: React.FC<
  MembershipRetentionCardProps
> = ({ award }) => {
  const view = viewOf(award)
  const winnerCount =
    view.kind === 'standings' ? view.rows.filter(r => r.isWinner).length : 0
  const winnerLabel =
    view.kind === 'standings' && view.final ? 'winner' : 'top 3 so far'
  // Same tie handling as the other award cards (#1610).
  const tiedIds =
    view.kind === 'standings' ? tiedWinnerIds(view.rows) : new Set<string>()

  return (
    <section
      className="awards-page-card"
      aria-labelledby="award-membershipRetentionAward-title"
      data-testid="membership-retention-card"
    >
      <header className="awards-page-card__header">
        <h2
          id="award-membershipRetentionAward-title"
          className="awards-page-card__title"
        >
          President&apos;s Membership Retention Award
        </h2>
        <p className="awards-page-card__description">
          Members who paid April dues, out of those who paid October dues (on
          time or late) or joined before April. The top 3 districts win.
        </p>
        <div className="awards-page-card__meta">
          <span className="awards-page-card__tag">Toast Stats estimate</span>
          {view.kind === 'standings' && view.final && winnerCount > 0 && (
            <span className="awards-page-card__achieved">
              ✓ {winnerCount} achieved
            </span>
          )}
        </div>
        {view.kind === 'standings' && (
          <p className="awards-page-card__status">
            {view.final
              ? 'Final standings at June 30.'
              : 'Standings so far. They become final on June 30.'}
          </p>
        )}
        {tiedIds.size > 0 && (
          <p className="awards-page-card__tie-note">
            {tiedIds.size} districts tied — {TIE_BREAK_UNPUBLISHED}, so they
            share a rank.
          </p>
        )}
      </header>

      {view.kind === 'not-started' && (
        <p className="awards-page-card__empty">
          These standings start in April, when April renewals open. Last
          year&apos;s final standings are on the June 30 date.
        </p>
      )}

      {view.kind === 'unavailable' && (
        <p className="awards-page-card__empty">
          The estimate isn&apos;t available for this date. It needs the March 31
          figures, and this snapshot doesn&apos;t have them.
        </p>
      )}

      {view.kind === 'standings' && (
        <ol className="awards-page-card__list">
          {view.rows.map(entry => (
            <li key={entry.districtId} className="awards-page-card__row">
              <span className="awards-page-card__rank">#{entry.rank}</span>
              <span className="awards-page-card__name">
                <Link
                  to={`/district/${entry.districtId}`}
                  className="awards-page-card__district"
                >
                  <DistrictLinkText
                    id={entry.districtId}
                    name={entry.districtName}
                  />
                </Link>
                {entry.isWinner && (
                  <>
                    {' '}
                    <span className="awards-page-card__winner">
                      {winnerLabel}
                    </span>
                  </>
                )}
                {tiedIds.has(entry.districtId) && (
                  <>
                    {' '}
                    <span
                      className="awards-page-card__tied"
                      title={TIE_BREAK_UNPUBLISHED}
                    >
                      tied
                    </span>
                  </>
                )}
              </span>
              <span className="awards-page-card__region">R{entry.region}</span>
              <span className="awards-page-card__value">
                {entry.value.toFixed(1)}%{' '}
                <span className="awards-page-card__value-detail">
                  ({count(entry.retained)} of {count(entry.base)})
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="awards-page-card__footnote">
        This is our estimate, not Toastmasters International&apos;s result.{' '}
        <Link
          to={MEMBERSHIP_RETENTION_METHODOLOGY_HREF}
          className="awards-page-card__methodology-link"
        >
          See how we work it out
        </Link>
        .
      </p>
    </section>
  )
}

export default MembershipRetentionCard
