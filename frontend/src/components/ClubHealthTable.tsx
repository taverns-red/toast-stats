/* ClubHealthTable (#2718, M5 of #2676): the club table shared by the Division
   and Area pages, on the shared `.dt` styles.

   14px data and headers, a caption, the club name as the row header
   (`th scope="row"`) holding the only link, a labelled sideways scroller, and
   no whole-row click (the 44px name link is the target). Health and Distinguished
   use the shared cells; the page shows one `HealthLegend` above its tables.
   Phones get ClubMiniList instead, so this is the tablet and desktop table. */

import React from 'react'
import { Link } from 'react-router-dom'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { HealthStatusCell } from './dataTable/cells/HealthStatusCell'
import { TierCell } from './dataTable/cells/TierCell'
import { StaticTableScroll } from './dataTable/StaticTableScroll'
import { isProvisionallyDistinguished } from '../utils/provisionalDistinguished'

interface ClubHealthTableProps {
  clubs: ClubTrend[]
  districtId: string
  /** Names the table and its scroll region, e.g. "Clubs in Area 01". Unique
   *  per table on a page. */
  label: string
}

export const ClubHealthTable: React.FC<ClubHealthTableProps> = ({
  clubs,
  districtId,
  label,
}) => (
  <div className="districts-rankings-table-wrap">
    <StaticTableScroll label={label}>
      <table className="dt entity-table entity-table--clubs">
        <caption className="sr-only">{`${label} and their health status`}</caption>
        <thead>
          <tr>
            <th scope="col">Club</th>
            <th scope="col">Health</th>
            <th scope="col" className="dt-num">
              Members
            </th>
            <th scope="col">Distinguished</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map(c => {
            const last = c.membershipTrend[c.membershipTrend.length - 1]
            return (
              <tr key={c.clubId}>
                <th scope="row">
                  <Link
                    to={`/district/${districtId}/club/${c.clubId}`}
                    className="entity-table__link"
                  >
                    {c.clubName}
                  </Link>
                </th>
                <td>
                  <HealthStatusCell status={c.currentStatus} />
                </td>
                <td className="dt-num">{last?.count ?? '—'}</td>
                <td>
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
    </StaticTableScroll>
  </div>
)

export default ClubHealthTable
