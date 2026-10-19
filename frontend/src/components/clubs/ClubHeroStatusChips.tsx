import React from 'react'
import type { ClubHealthStatus } from '../../hooks/useDistrictAnalytics'

export interface ClubHeroStatusChipsProps {
  status: ClubHealthStatus
  /** The analytics DCP level; 'NotDistinguished' or absent renders no chip. */
  distinguishedLevel?: string | undefined
  /** Set when the tier is provisional: the chip reads "(provisional)" and
   *  carries this as its tooltip. */
  provisionalTitle?: string | undefined
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
 * one quiet outline chip (`.club-hero__chip`); only the health chip carries
 * a coloured dot, because only there does the colour mean something.
 */
export const ClubHeroStatusChips: React.FC<ClubHeroStatusChipsProps> = ({
  status,
  distinguishedLevel,
  provisionalTitle,
}) => {
  const { label, modifier } = STATUS[status] ?? STATUS.thriving
  const showTier =
    Boolean(distinguishedLevel) && distinguishedLevel !== 'NotDistinguished'
  return (
    <>
      <span className={`club-hero__chip ${modifier}`}>
        <span aria-hidden="true" className="club-hero__chip-dot" />
        {label}
      </span>
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
