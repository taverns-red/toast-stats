import React, { useMemo } from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { findClubsNeedingMembers } from '../utils/membersToDistinguished'

interface ClubsNeedingMembersCardProps {
  clubs: ClubTrend[]
  isLoading?: boolean
  onClubClick?: (clubId: string) => void
}

/**
 * ClubsNeedingMembersCard (#273)
 *
 * Summary card showing clubs that only need additional members to become
 * Distinguished. Sorted by fewest members needed (closest to Distinguished first).
 *
 * Displayed on the district Overview tab to help district directors quickly
 * identify low-hanging fruit for membership coaching.
 */
export const ClubsNeedingMembersCard: React.FC<
  ClubsNeedingMembersCardProps
> = ({ clubs, isLoading = false, onClubClick }) => {
  const clubsNeedingMembers = useMemo(
    () => findClubsNeedingMembers(clubs),
    [clubs]
  )

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-2/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-gray-100 rounded w-full"></div>
          ))}
        </div>
      </div>
    )
  }

  if (clubsNeedingMembers.length === 0) {
    return null // Don't render the card if no clubs qualify
  }

  const topClubs = clubsNeedingMembers.slice(0, 10)
  const hasMore = clubsNeedingMembers.length > 10

  return (
    <div
      className="bg-white rounded-lg shadow-md overflow-hidden"
      id="clubs-needing-members-card"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-tm-loyal-blue-10 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 font-tm-headline">
              Clubs Needing Only Members
            </h3>
            <p className="text-sm text-gray-600 font-tm-body mt-0.5">
              {clubsNeedingMembers.length} club
              {clubsNeedingMembers.length !== 1 ? 's' : ''} could become
              Distinguished by adding members
            </p>
          </div>
          <div className="flex-shrink-0 ml-4">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-tm-happy-yellow-20 text-tm-true-maroon font-bold text-lg font-tm-headline">
              {clubsNeedingMembers.length}
            </span>
          </div>
        </div>
      </div>

      {/* Club List */}
      <div className="divide-y divide-gray-100">
        {topClubs.map(club => (
          <div
            key={club.clubId}
            className={`px-6 py-3 flex items-center justify-between ${
              onClubClick
                ? 'cursor-pointer hover:bg-gray-50 transition-colors'
                : ''
            }`}
            onClick={() => onClubClick?.(club.clubId)}
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-medium text-gray-900 truncate">
                {club.clubName}
              </p>
              <p className="text-xs text-gray-500 font-tm-body">
                Div {club.division} · Area {club.area} · {club.currentMembers}{' '}
                members · {club.currentGoals} DCP goals
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-tm-happy-yellow-20 text-tm-true-maroon font-tm-body">
                +{club.membersNeeded} member
                {club.membersNeeded !== 1 ? 's' : ''}
              </span>
              {club.goalsEarned.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  → Goal {club.goalsEarned.join(' + ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {hasMore && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500 font-tm-body text-center">
            +{clubsNeedingMembers.length - 10} more clubs need members
          </p>
        </div>
      )}
    </div>
  )
}
