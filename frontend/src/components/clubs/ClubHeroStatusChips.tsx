import React from 'react'
import type { ClubHealthStatus } from '../../hooks/useDistrictAnalytics'

export interface ClubHeroStatusChipsProps {
  status: ClubHealthStatus
  /** The analytics DCP level; 'NotDistinguished' or absent renders no chip. */
  distinguishedLevel?: string | undefined
  /** Set when the tier is provisional: the chip reads "(provisional)" and
   *  carries this as its tooltip. */
  provisionalTitle?: string | undefined
  /** The operational status from Toastmasters ("Active", "Suspended", "Low",
   *  "Ineligible"). Anything but Active/absent gets its own chip (#2639). */
  clubStatus?: string | undefined
  /** A pre-formatted date for the status chip ("Sep 30, 2026"), when known. */
  statusSince?: string | undefined
}

const STATUS: Record<ClubHealthStatus, { label: string; modifier: string }> = {
  thriving: { label: 'Thriving', modifier: 'club-hero__chip--thriving' },
  vulnerable: { label: 'Vulnerable', modifier: 'club-hero__chip--watch' },
  'intervention-required': {
    label: 'Intervention required',
    modifier: 'club-hero__chip--at-risk',
  },
}

/**
 * The club hero's health and DCP tier badges (#2171). Both use the hero's
 * one quiet outline chip (`.club-hero__chip`); the health chip and a
 * non-Active club-status chip carry a coloured dot (Low is amber, Suspended
 * and Ineligible red), because only there does the colour mean something.
 */
export const ClubHeroStatusChips: React.FC<ClubHeroStatusChipsProps> = ({
  status,
  distinguishedLevel,
  provisionalTitle,
  clubStatus,
  statusSince,
}) => {
  const { label, modifier } = STATUS[status] ?? STATUS.thriving
  const showTier =
    Boolean(distinguishedLevel) && distinguishedLevel !== 'NotDistinguished'
  // Suspended, Low and Ineligible change what the club can do, so the first
  // screen says so in words (#2639); Active adds nothing.
  const operational =
    clubStatus && clubStatus !== 'Active'
      ? statusSince && clubStatus === 'Suspended'
        ? `${clubStatus} since ${statusSince}`
        : clubStatus
      : null
  return (
    <>
      <span className={`club-hero__chip ${modifier}`}>
        <span aria-hidden="true" className="club-hero__chip-dot" />
        {label}
      </span>
      {operational && (
        <span
          className={`club-hero__chip ${
            clubStatus === 'Low'
              ? 'club-hero__chip--watch'
              : 'club-hero__chip--at-risk'
          }`}
          title="Club status"
        >
          <span aria-hidden="true" className="club-hero__chip-dot" />
          {operational}
        </span>
      )}
      {showTier && (
        <span className="club-hero__chip" title={provisionalTitle}>
          {distinguishedLevel === 'President'
            ? "President's"
            : distinguishedLevel}
          {provisionalTitle !== undefined && ' (provisional)'}
        </span>
      )}
    </>
  )
}
