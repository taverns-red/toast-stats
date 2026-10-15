import React from 'react'
import { Link } from 'react-router-dom'
import { formatCharterDate } from '../../utils/formatCharterDate'
import { getClubAnniversary } from '../../utils/clubAnniversary'
import { ClubAnniversaryBadge } from '../ClubAnniversaryBadge'
import {
  buildClubMeetingInfo,
  type ClubMeetingSource,
} from '../../utils/clubMeetingInfo'
import { ClubWhereItMeets } from './ClubWhereItMeets'
import type { ClubLineage } from '../../utils/clubLineage'

/**
 * The fields the club hero shows. `ClubTrend` satisfies it, and so does the
 * district snapshot's transformed `clubs[]` record, which carries the same
 * values analytics copies into `ClubTrend` (#1901).
 */
export interface ClubHeroSource extends ClubMeetingSource {
  clubName: string
  areaName?: string | undefined
  divisionName?: string | undefined
  charterDate?: string | undefined
}

export interface ClubHeroProps {
  clubId: string
  districtId: string | undefined
  club: ClubHeroSource
  /** The PY/date controls; the page owns that state (R3). */
  controls: React.ReactNode
  /**
   * The analytics-derived health and tier pills. Undefined while analytics is
   * still loading: a size-holding placeholder takes their slot, so the hero
   * does not shift when they arrive (#1901).
   */
  statusPills?: React.ReactNode
  /** #1805 — former districts and names; null/undefined renders no chip. */
  lineage?: ClubLineage | null | undefined
}

/**
 * Club page hero, per the redesign handoff (#23 follow-up): a Loyal-blue
 * panel with a charter-style eyebrow, the h1, a sub-line, and health and DCP
 * tier pills on the right.
 *
 * #432 appends ' · Chartered <Month YYYY>' to the eyebrow when Find-A-Club
 * enrichment (#430) supplied a charterDate. It is skipped silently when absent.
 */
export const ClubHero: React.FC<ClubHeroProps> = ({
  clubId,
  districtId,
  club,
  controls,
  statusPills,
  lineage,
}) => {
  const charterLabel = formatCharterDate(club.charterDate)
  return (
    <header className="club-hero">
      <div className="club-hero__intro">
        <p className="club-hero__eyebrow">
          Club #{clubId}
          {charterLabel ? ` · Chartered ${charterLabel}` : ''}
        </p>
        <h1 className="club-hero__title">{club.clubName}</h1>
        <p className="club-hero__sub">
          <span>{club.areaName}</span>
          <span aria-hidden="true" className="club-hero__sub-divider">
            ·
          </span>
          <span>{club.divisionName}</span>
          {districtId && (
            <>
              <span aria-hidden="true" className="club-hero__sub-divider">
                ·
              </span>
              <span>District {districtId}</span>
            </>
          )}
          {/* #1805 — lineage chips (club-district history, #1782). Each is
              one flex item, so a narrow line wraps a whole chip, never
              mid-phrase. */}
          {lineage?.formerDistricts.length ? (
            <span className="club-hero__lineage">
              {/* The leading space keeps the line's text readable as one
                  phrase (copy, screen readers); flex drops it visually. */}
              {` (${lineage.formerDistricts.join('; ')})`}
            </span>
          ) : null}
          {lineage?.formerNames.length ? (
            <span className="club-hero__lineage">
              {` Formerly ${lineage.formerNames.join(', ')}`}
            </span>
          ) : null}
        </p>
        {/* #1783: where the club meets (FAC enrichment for the viewed date;
            omitted when the snapshot has none). Never shows email or phone. */}
        <ClubWhereItMeets info={buildClubMeetingInfo(club)} />
        {/* #1229: deep link to the per-club multi-year history view. */}
        <Link
          to={`/district/${districtId}/club/${clubId}/history`}
          className="club-hero__history-link"
        >
          View multi-year history →
        </Link>
        <div className="club-hero__controls">{controls}</div>
      </div>

      <div className="club-hero__pills">
        {/* #445: anniversary badge (years chartered, milestones, a countdown
            within ±30 days). Omitted when charterDate is missing. */}
        {/* #1843: the phone hero keeps two pills (health, tier); the
            badge is hidden below 768 by CSS. */}
        {club.charterDate && (
          <span className="club-hero__anniversary">
            <ClubAnniversaryBadge
              anniversary={getClubAnniversary(club.charterDate)}
              {...(charterLabel ? { charterDateLabel: charterLabel } : {})}
            />
          </span>
        )}
        {statusPills ?? (
          <span
            aria-hidden="true"
            data-testid="club-hero-pill-placeholder"
            className="club-hero__pill"
            style={{ visibility: 'hidden' }}
          >
            <span className="club-hero__pill-dot" />
            {'\u00a0'.repeat(8)}
          </span>
        )}
      </div>
    </header>
  )
}
