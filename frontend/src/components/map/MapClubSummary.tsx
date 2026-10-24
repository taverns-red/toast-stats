import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { toastmastersClubPageUrl } from '../../utils/toastmastersClubPageUrl'
import { buildClubMeetingInfo } from '../../utils/clubMeetingInfo'
import { buildModeModel, type PinCategory } from './pinModes'
import { PinSwatch } from './PinSwatch'

/* The selected pin's summary (#1784): what a tap on a pin opens — in the
   phone sheet, or the side panel from 768. Name, where it sits, its health
   and Distinguished level (same registry as the pins, so they agree), a
   link to the club page and the TI club page for contact.

   #1788 adds members · goals and the meeting line (day/time, online or in
   person), built only through buildClubMeetingInfo, which drops any text
   that gives entry to a meeting.

   Privacy: only these whitelisted fields render — never email, phone,
   meeting links or passcodes. Co-located clubs (same building) are listed
   together, since zooming never separates them. */

const HEALTH = buildModeModel('health')
const TIER = buildModeModel('tier')

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Latest members and DCP goals, from the trends the pins already carry. */
function countsLine(club: ClubTrend): string | null {
  const members = club.membershipTrend[club.membershipTrend.length - 1]?.count
  const goals = club.dcpGoalsTrend[club.dcpGoalsTrend.length - 1]?.goalsAchieved
  return (
    [
      members !== undefined && plural(members, 'member'),
      goals !== undefined && plural(goals, 'goal'),
    ]
      .filter(Boolean)
      .join(' · ') || null
  )
}

function meetingLine(club: ClubTrend): string | null {
  const info = buildClubMeetingInfo(club)
  return (
    [info?.schedule ?? info?.scheduleNote, info?.mode]
      .filter(Boolean)
      .join(' · ') || null
  )
}

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
  /** Opened from the keyboard (#1967): focus the first club's heading, then
   *  report it so a later pointer tap leaves focus where it is. */
  autoFocus?: boolean
  onAutoFocused?: () => void
  /** A region map's clubs span districts (#1808): each club's own, named
   *  in its place line and its link. */
  districtOf?: ((club: ClubTrend) => string) | undefined
}> = ({ clubs, districtId, autoFocus = false, onAutoFocused, districtOf }) => {
  const first = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!autoFocus || !first.current) return
    first.current.focus()
    onAutoFocused?.()
  }, [autoFocus, onAutoFocused])
  return (
    <div className="map-club">
      {clubs.map((club, i) => {
        const health = HEALTH.categoryOf(club)
        const ti = toastmastersClubPageUrl(club.clubId)
        const counts = countsLine(club)
        const meeting = meetingLine(club)
        const district = districtOf?.(club)
        return (
          <article key={club.clubId} className="map-club__item">
            <h3
              ref={i === 0 ? first : undefined}
              tabIndex={-1}
              className="map-club__name"
            >
              {club.clubName}
            </h3>
            <p className="map-club__place">
              {[
                district && `District ${district}`,
                club.divisionName,
                club.areaName,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {counts && <p className="map-club__line">{counts}</p>}
            {meeting && <p className="map-club__line">{meeting}</p>}
            <dl className="map-club__facts">
              <Fact term="Health" cat={health} />
              {health.shape !== 'suspended' && (
                <Fact term="Distinguished" cat={TIER.categoryOf(club)} />
              )}
            </dl>
            <div className="map-club__links">
              <Link
                to={`/district/${district ?? districtId}/club/${club.clubId}`}
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
}
