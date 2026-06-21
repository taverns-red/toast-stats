import React from 'react'
import { Link } from 'react-router-dom'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { getTileVisual, type GridColorMode } from '../utils/clubGridColor'

/**
 * A single club tile in the at-a-glance district grid (#1230, epic #1228) — the
 * "Chiclet / LEO board" cell. The tile fill is keyed on club health or
 * Distinguished tier (per `colorMode`); the meaning is ALSO carried in text:
 * the accessible name (status + DCP) and a non-colour glyph, so colour is never
 * the only signal (WCAG 1.4.1). The whole tile is a real <Link> to club detail,
 * making it keyboard-operable and screen-reader navigable.
 */

export interface ClubGridTileProps {
  club: ClubTrend
  districtId: string
  colorMode: GridColorMode
  /** Optional router location state to carry to the destination. */
  linkState?: unknown
}

export const ClubGridTile: React.FC<ClubGridTileProps> = ({
  club,
  districtId,
  colorMode,
  linkState,
}) => {
  const visual = getTileVisual(club, colorMode)
  const location = [club.divisionName, club.areaName]
    .filter(Boolean)
    .join(' · ')
  const ariaLabel =
    `${club.clubName}${location ? `, ${location}` : ''}. ` +
    `${visual.statusLabel}. DCP ${visual.signalText}.`

  return (
    <Link
      to={`/district/${districtId}/club/${club.clubId}`}
      state={linkState}
      className={`club-grid-tile ${visual.modifierClass}`}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className="club-grid-tile__name">{club.clubName}</span>
      <span className="club-grid-tile__signal">
        <span className="club-grid-tile__glyph" aria-hidden="true">
          {visual.signalGlyph}
        </span>
        <span className="club-grid-tile__dcp tabular-nums">
          {visual.signalText}
        </span>
      </span>
    </Link>
  )
}

export default ClubGridTile
