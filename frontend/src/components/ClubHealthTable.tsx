/* ClubHealthTable (#2718, M5 of #2676): the club table shared by the Division
   and Area pages. This is the markup both pages carried inline, extracted
   unchanged; the shared-table styling follows in the next commit. */

import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { HealthStatusCell } from './dataTable/cells/HealthStatusCell'
import { TierCell } from './dataTable/cells/TierCell'
import { isProvisionallyDistinguished } from '../utils/provisionalDistinguished'

interface ClubHealthTableProps {
  clubs: ClubTrend[]
  districtId: string
  /** Names the table and its scroll region, e.g. "Clubs in Area 01". */
  label: string
}

export const ClubHealthTable: React.FC<ClubHealthTableProps> = ({
  clubs,
  districtId,
}) => {
  const navigate = useNavigate()
  return (
    <div className="districts-rankings-table-wrap">
      <div className="overflow-x-auto">
        <table
          className="districts-rankings-table"
          aria-label="Clubs and their health status"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Club
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Health
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Members
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Distinguished
              </th>
            </tr>
          </thead>
          <tbody>
            {clubs.map(c => {
              const last = c.membershipTrend[c.membershipTrend.length - 1]
              return (
                <tr
                  key={c.clubId}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate(`/district/${districtId}/club/${c.clubId}`)
                  }
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/district/${districtId}/club/${c.clubId}`}
                      onClick={e => e.stopPropagation()}
                      className="clubs-name-link text-sm font-medium text-gray-900"
                    >
                      {c.clubName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <HealthStatusCell status={c.currentStatus} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 tabular-nums">
                    {last?.count ?? '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <TierCell
                      level={c.distinguishedLevel}
                      provisional={isProvisionallyDistinguished(c)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ClubHealthTable
