import { Link } from 'react-router-dom'
import { ActionTable, type ActionTableColumn } from '../ActionTable'
import { StageSection } from '../ClubGrowthFunnelView'
import { ReinstatementFaqSource } from '../ReinstatableClubsSection'
import type { MobileRow } from '../MobileRowList'
import {
  unknownPhrase,
  type ReinstateDistrictRow,
  type RollupReinstate,
} from '../../utils/rollupReinstate'

/* #3094 — "Can reinstate" on the region and world funnels: the district
   section (#3007) summed, broken down by district. Each district links to
   its own section, where the clubs and the reasons are listed. Counts only,
   like the rest of the rollup funnel. */

const n = (v: number) => v.toLocaleString('en-US')

const addsText = (v: number, base: string) =>
  `${n(v)} ${v === 1 ? 'adds' : 'add'} to ${base}`

function columns(
  base: string,
  withUnknown: boolean
): ActionTableColumn<ReinstateDistrictRow>[] {
  const cols: ActionTableColumn<ReinstateDistrictRow>[] = [
    {
      key: 'district',
      header: 'District',
      className: 'action-table__subject growth-table__club',
      cell: r => (
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
      key: 'adds',
      header: `Adds to ${base}`,
      className: 'growth-table__num',
      cell: r => n(r.adds),
    },
    {
      key: 'oldest',
      header: 'Oldest period',
      className: 'growth-table__num',
      cell: r => n(r.oldest),
    },
  ]
  // Only when a district in scope has one, so the table stays narrow.
  if (withUnknown) {
    cols.push({
      key: 'unknown',
      header: 'Effect on the club base not known',
      className: 'growth-table__num',
      cell: r => n(r.unknown),
    })
  }
  return cols
}

/* Phone row (#3094 UX review): rows are sorted by adds, so line 1 leads
   with it and there is no total chip to read as the sort key. Both lines
   wrap in full words (see growth.css), never clipped. */
function mobileRow(base: string) {
  return (r: ReinstateDistrictRow): MobileRow => {
    const details = [
      `${n(r.total)} can reinstate`,
      `${n(r.suspended)} suspended`,
      `${n(r.closed)} closed`,
      `${n(r.oldest)} oldest period`,
      ...(r.unknown > 0 ? [unknownPhrase(r.unknown)] : []),
    ]
    return {
      id: r.id,
      to: r.to,
      title: `${r.label} — ${addsText(r.adds, base)}`,
      meta: details.join(' · '),
      ariaLabel: `${r.label}: ${[addsText(r.adds, base), ...details].join(', ')}`,
    }
  }
}

export function RollupReinstateSection({
  reinstate,
}: {
  reinstate: RollupReinstate
}) {
  const { count, adds, unknown, nextYear, rows } = reinstate
  const base = nextYear ? 'next year’s club base' : 'the club base'
  return (
    <StageSection id="reinstate" title={`Can reinstate (${n(count)})`}>
      <p className="growth-stage__note">
        Suspended clubs, and clubs closed in the past four renewal periods, can
        reinstate. Toastmasters International makes the final call.
      </p>
      {count > 0 && (
        <p
          className="growth-stage__note"
          data-testid="rollup-growth-reinstate-split"
        >
          {n(adds)} of {n(count)} {adds === 1 ? 'adds' : 'add'} to {base}.
          {unknown > 0 && ` ${unknownPhrase(unknown)}.`}
        </p>
      )}
      <div className="growth-stage__note">
        <ReinstatementFaqSource />
      </div>
      {rows.length === 0 ? (
        <p className="growth-stage__note">
          No suspended or recently closed clubs can reinstate right now.
        </p>
      ) : (
        <>
          <h4 className="growth-stage__subtitle">By district</h4>
          <p className="growth-stage__note">
            Oldest period counts the clubs closed in the oldest of the four
            renewal periods. Confirm those with World Headquarters. Select a
            district to see its clubs and why each one can come back.
          </p>
          <div className="rollup-reinstate__rows">
            <ActionTable
              caption="Clubs that can reinstate by district"
              columns={columns(
                base,
                rows.some(r => r.unknown > 0)
              )}
              rows={rows}
              rowKey={r => r.id}
              mobileRow={mobileRow(base)}
              testId="rollup-growth-reinstate-table"
            />
          </div>
        </>
      )}
    </StageSection>
  )
}

export default RollupReinstateSection
