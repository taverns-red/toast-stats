import React from 'react'
import { Link } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { toastmastersClubPageUrl } from '../../utils/toastmastersClubPageUrl'
import { buildModeModel, type PinCategory } from './pinModes'
import { PinSwatch } from './PinSwatch'

/* The selected pin's summary (#1784): what a tap on a pin opens — in the
   phone sheet, or the side panel from 768. Name, where it sits, its health
   and Distinguished level (same registry as the pins, so they agree), a
   link to the club page and the TI club page for contact.

   Privacy: only these whitelisted fields render — never email, phone,
   meeting links or passcodes. Co-located clubs (same building) are listed
   together, since zooming never separates them. */

const HEALTH = buildModeModel('health')
const TIER = buildModeModel('tier')

const Fact: React.FC<{ term: string; cat: PinCategory }> = ({ term, cat }) => (
  <div className="map-club__fact">
    <dt>{term}</dt>
    <dd>
      <PinSwatch category={cat} />
      <span>{cat.label}</span>
    </dd>
  </div>
)

export const MapClubSummary: React.FC<{
  clubs: ClubTrend[]
  districtId: string
}> = ({ clubs, districtId }) => (
  <div className="map-club">
    {clubs.map(club => {
      const health = HEALTH.categoryOf(club)
      const ti = toastmastersClubPageUrl(club.clubId)
      return (
        <article key={club.clubId} className="map-club__item">
          <h3 className="map-club__name">{club.clubName}</h3>
          <p className="map-club__place">
            {[club.divisionName, club.areaName].filter(Boolean).join(' · ')}
          </p>
          <dl className="map-club__facts">
            <Fact term="Health" cat={health} />
            {health.shape !== 'suspended' && (
              <Fact term="Distinguished" cat={TIER.categoryOf(club)} />
            )}
          </dl>
          <div className="map-club__links">
            <Link
              to={`/district/${districtId}/club/${club.clubId}`}
              className="map-club__link"
            >
              Open club page →
            </Link>
            {ti && (
              <a
                href={ti}
                target="_blank"
                rel="noopener noreferrer"
                className="map-club__link"
              >
                Contact on toastmasters.org ↗
              </a>
            )}
          </div>
        </article>
      )
    })}
  </div>
)
