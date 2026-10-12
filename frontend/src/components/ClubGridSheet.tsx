import React from 'react'
import { Link } from 'react-router-dom'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { getTileVisual, type TileVisual } from '../utils/clubGridColor'
import { BottomSheet } from './BottomSheet'

/* Club grid sheet (#1845, mobile epic #1827 Phase 2, review §2 S8).

   On a phone a grid tile is tapped, not hovered, so the full club name and
   its status can't live in a `title` tooltip. This is what the tap opens: the
   shared BottomSheet (#1831) titled with the club's full name, then where it
   sits, its health, its Distinguished tier and DCP goals, and one link to the
   club page. Health and tier come from `getTileVisual`, the same source as
   the tiles and the legend, so the three can't disagree (Lesson 052); a
   suspended club shows one "Suspended" status, as its tile does.

   Privacy: only these whitelisted fields render — never contact details,
   meeting links or passcodes. */

export interface ClubGridSheetProps {
  /** The tapped club; null keeps the sheet closed. */
  club: ClubTrend | null
  districtId: string
  onClose: () => void
}

const Swatch: React.FC<{ visual: TileVisual }> = ({ visual }) => (
  <span
    className={`club-grid-legend__swatch ${visual.modifierClass}`}
    aria-hidden="true"
  >
    {visual.signalGlyph}
  </span>
)

export const ClubGridSheet: React.FC<ClubGridSheetProps> = ({
  club,
  districtId,
  onClose,
}) => {
  if (!club) return null

  const health = getTileVisual(club, 'health')
  const tier = getTileVisual(club, 'tier')
  const suspended = health.modifierClass === 'club-grid-tile--suspended'
  const location = [club.divisionName, club.areaName]
    .filter(Boolean)
    .join(' · ')

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={club.clubName}
      closeLabel="Close club details"
    >
      <div className="club-grid-sheet">
        {location && <p className="club-grid-sheet__location">{location}</p>}
        <dl className="club-grid-sheet__facts">
          {suspended ? (
            <div className="club-grid-sheet__fact">
              <dt>Status</dt>
              <dd>
                <Swatch visual={health} />
                <span>{health.statusLabel}</span>
              </dd>
            </div>
          ) : (
            <>
              <div className="club-grid-sheet__fact">
                <dt>Health</dt>
                <dd>
                  <Swatch visual={health} />
                  <span>{health.statusLabel}</span>
                </dd>
              </div>
              <div className="club-grid-sheet__fact">
                <dt>Distinguished</dt>
                <dd>
                  <Swatch visual={tier} />
                  <span>{tier.statusLabel}</span>
                </dd>
              </div>
            </>
          )}
          <div className="club-grid-sheet__fact">
            <dt>DCP goals</dt>
            <dd>
              <span className="tabular-nums">{health.signalText}</span>
            </dd>
          </div>
        </dl>
        <Link
          to={`/district/${districtId}/club/${club.clubId}`}
          className="club-grid-sheet__link"
        >
          Open club page
        </Link>
      </div>
    </BottomSheet>
  )
}

export default ClubGridSheet
