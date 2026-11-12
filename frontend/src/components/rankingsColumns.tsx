/**
 * Column model for the landing rankings table (#2689, #2676 M1).
 *
 * Column ids are the sort fields the page already round-trips through the URL
 * (`?sort=clubs|payments|distinguished`), except Score, whose id is `score`
 * and whose field is `aggregate` (see `rankingsSortField`). Widths and the
 * per-tier defaults live in `rankingsColumnMeta.ts`; the cells in
 * `rankingsCells.tsx`.
 */

import {
  rankingsColumnHelper as colHelper,
  type RankingsTableMeta,
} from './rankingsTableFeatures'
import { DistrictCell, Metric } from './rankingsCells'
import { rankingsColumnMeta } from './rankingsColumnMeta'
import {
  formatNumber,
  medalOf,
  rankBadgeClassName,
} from '../utils/rankingsFormat'

/** The URL sort field behind a column id (Score sorts by `aggregate`). */
export const rankingsSortField = (columnId: string): string =>
  columnId === 'score' ? 'aggregate' : columnId

/** The column id that shows a URL sort field. */
export const rankingsColumnForSortField = (
  field: string | null
): string | null => (field === 'aggregate' ? 'score' : field)

export const rankingsColumns = colHelper.columns([
  colHelper.display({
    id: 'district',
    header: rankingsColumnMeta.district.label,
    cell: info => (
      <DistrictCell
        district={info.row.original}
        meta={info.table.options.meta as RankingsTableMeta}
      />
    ),
  }),
  colHelper.display({
    id: 'rank',
    header: rankingsColumnMeta.rank.label,
    cell: info => {
      const rank = info.row.original.displayRank
      return (
        <span
          data-testid={`rank-badge-${info.row.original.districtId}`}
          data-medal={medalOf(rank)}
          className={rankBadgeClassName(rank)}
        >
          {rank}
        </span>
      )
    },
  }),
  colHelper.accessor(d => d.paidClubs, {
    id: 'clubs',
    header: rankingsColumnMeta.clubs.label,
    cell: info => {
      const d = info.row.original
      return (
        <Metric
          value={d.paidClubs}
          rank={d.clubsRank}
          pct={d.clubGrowthPercent}
        />
      )
    },
  }),
  colHelper.accessor(d => d.totalPayments, {
    id: 'payments',
    header: rankingsColumnMeta.payments.label,
    cell: info => {
      const d = info.row.original
      return (
        <Metric
          value={d.totalPayments}
          rank={d.paymentsRank}
          pct={d.paymentGrowthPercent}
        />
      )
    },
  }),
  colHelper.accessor(d => d.distinguishedClubs, {
    id: 'distinguished',
    header: rankingsColumnMeta.distinguished.label,
    cell: info => {
      const d = info.row.original
      return (
        <Metric
          value={d.distinguishedClubs}
          rank={d.distinguishedRank}
          pct={d.distinguishedPercent}
        />
      )
    },
  }),
  colHelper.accessor(d => d.aggregateScore, {
    id: 'score',
    header: rankingsColumnMeta.score.label,
    cell: info => (
      <span className="rankings-score">
        {formatNumber(Math.round(info.row.original.aggregateScore))}
      </span>
    ),
  }),
])
