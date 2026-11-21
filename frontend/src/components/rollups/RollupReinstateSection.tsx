import { Link } from 'react-router-dom'
import { ActionTable, type ActionTableColumn } from '../ActionTable'
import { StageSection } from '../ClubGrowthFunnelView'
import { ReinstatementRequirements } from '../ReinstatableClubsSection'
import type { MobileRow } from '../MobileRowList'
import type {
  ReinstateDistrictRow,
  RollupReinstate,
} from '../../utils/rollupReinstate'

/* #3094 — "Can reinstate" on the region and world funnels: the district
   section (#3007) summed, broken down by district. Each district links to
   its own section, where the clubs and the reasons are listed; a retired
   district gets Ron's note instead, as it has no current page. Counts only,
   like the rest of the rollup funnel. */

const n = (v: number) => v.toLocaleString('en-US')

/** #3130 (Ron, 2026-11-21): the rollups count the clubs that add to net
 *  club growth, the same n as the card. */
const addsText = (v: number) =>
  `${n(v)} ${v === 1 ? 'adds' : 'add'} to net club growth`

function columns(): ActionTableColumn<ReinstateDistrictRow>[] {
  return [
    {
      key: 'district',
      header: 'District',
      className: 'action-table__subject growth-table__club',
      cell: r =>
        r.to === undefined ? (
          <>
            <span className="rollup-reinstate__name">{r.label}</span>
            <span className="rollup-reinstate__retired">{r.retiredNote}</span>
          </>
        ) : (
          <Link to={r.to} className="growth-table__link">
            {r.label}
          </Link>
        ),
    },
    {
      key: 'suspended',
      header: 'Suspended',
      className: 'growth-table__num',
      cell: r => n(r.suspended),
    },
    {
      key: 'closed',
      header: 'Closed',
      className: 'growth-table__num',
      cell: r => n(r.closed),
    },
    {
      key: 'netGrowth',
      header: 'Adds to net club growth',
      className: 'growth-table__num',
      cell: r => n(r.netGrowth),
    },
  ]
}

/* Phone row (#3094 UX review): rows are sorted by net club growth (#3130),
   so line 1 leads
   with it and there is no total chip to read as the sort key. Both lines
   wrap in full words (see growth.css), never clipped. */
function mobileRow() {
  return (r: ReinstateDistrictRow): MobileRow => {
    const details = [
      `${n(r.total)} can reinstate`,
      `${n(r.suspended)} suspended`,
      `${n(r.closed)} closed`,
    ]
    return {
      id: r.id,
      ...(r.to !== undefined && { to: r.to }),
      title: `${r.label} — ${addsText(r.netGrowth)}`,
      // One meta line keeps the 56-64 px row (RollupReinstate.test, "a
      // retired district on a phone"), so the note takes the counts' place.
      meta: r.retiredNote ?? details.join(' · '),
      ariaLabel: `${r.label}: ${[addsText(r.netGrowth), ...details].join(', ')}`,
    }
  }
}

export function RollupReinstateSection({
  reinstate,
}: {
  reinstate: RollupReinstate
}) {
  const { count, netGrowth, rows } = reinstate
  return (
    <StageSection id="reinstate" title={`Can reinstate (${n(count)})`}>
      <p className="growth-stage__note">
        A suspended or closed club can reinstate until the end of its fifth
        renewal period, counting the period it was suspended in. Toastmasters
        International makes the final call.
      </p>
      {count > 0 && (
        <p
          className="growth-stage__note"
          data-testid="rollup-growth-reinstate-split"
        >
          {n(netGrowth)} of {n(count)} {netGrowth === 1 ? 'adds' : 'add'} to net
          club growth.
        </p>
      )}
      <ReinstatementRequirements />
      {rows.length === 0 ? (
        <p className="growth-stage__note">
          No suspended or recently closed clubs can reinstate right now.
        </p>
      ) : (
        <>
          <h4 className="growth-stage__subtitle">By district</h4>
          <p className="growth-stage__note">
            Select a district to see its clubs and why each one can come back.
          </p>
          <div className="rollup-reinstate__rows">
            <ActionTable
              caption="Clubs that can reinstate by district"
              columns={columns()}
              rows={rows}
              rowKey={r => r.id}
              mobileRow={mobileRow()}
              testId="rollup-growth-reinstate-table"
            />
          </div>
        </>
      )}
    </StageSection>
  )
}

export default RollupReinstateSection
