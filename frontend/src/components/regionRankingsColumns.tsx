/**
 * Column model for the region district rankings (#2702, #2676 M3).
 *
 * The page already round-trips five sort fields through the URL
 * (`?sort=aggregate|world-rank|clubs|payments|distinguished`); each maps to the
 * column that shows it (`regionRankingsSortField` and its inverse). The other
 * columns are display-only. Widths and the per-tier defaults live in
 * `regionRankingsColumnMeta.ts`; the cells in `regionRankingsCells.tsx`.
 */

import {
  regionRankingsColumnHelper as colHelper,
  type RegionRankingsTableMeta,
} from './regionRankingsTableFeatures'
import {
  CountCell,
  CountdownValue,
  DistrictCell,
  RankCell,
  SignedDelta,
  TierCell,
  TrendCell,
  WorldRankCell,
  netClubGrowth,
} from './regionRankingsCells'
import { regionRankingsColumnMeta as meta } from './regionRankingsColumnMeta'
import { DistinguishedCount } from './DistinguishedCount'

const SORT_FIELD_BY_COLUMN: Readonly<Record<string, string>> = {
  score: 'aggregate',
  worldRank: 'world-rank',
  paidClubs: 'clubs',
  payments: 'payments',
  distinguished: 'distinguished',
}

/** The URL sort field behind a column id. */
export const regionRankingsSortField = (columnId: string): string =>
  SORT_FIELD_BY_COLUMN[columnId] ?? columnId

/** The column id that shows a URL sort field. */
export const regionRankingsColumnForSortField = (
  field: string | null
): string | null =>
  Object.entries(SORT_FIELD_BY_COLUMN).find(([, f]) => f === field)?.[0] ??
  field

const tableMeta = (info: {
  table: { options: { meta?: unknown } }
}): RegionRankingsTableMeta =>
  info.table.options.meta as RegionRankingsTableMeta

export const regionRankingsColumns = colHelper.columns([
  colHelper.display({
    id: 'district',
    header: meta.district.label,
    cell: info => <DistrictCell district={info.row.original} />,
  }),
  colHelper.display({
    id: 'rank',
    header: meta.rank.label,
    cell: info => <RankCell district={info.row.original} />,
  }),
  colHelper.display({
    id: 'trend',
    header: meta.trend.label,
    cell: info => (
      <TrendCell
        series={tableMeta(info).trendOf(info.row.original.districtId)}
      />
    ),
  }),
  colHelper.accessor(d => d.overallRank, {
    id: 'worldRank',
    header: meta.worldRank.label,
    cell: info => <WorldRankCell rank={info.row.original.overallRank} />,
  }),
  colHelper.accessor(d => d.aggregateScore, {
    id: 'score',
    header: meta.score.label,
    cell: info => <>{info.row.original.aggregateScore}</>,
  }),
  colHelper.display({
    id: 'paidBase',
    header: meta.paidBase.label,
    cell: info => <CountCell value={info.row.original.paidClubBase ?? 0} />,
  }),
  colHelper.accessor(d => d.paidClubs, {
    id: 'paidClubs',
    header: meta.paidClubs.label,
    cell: info => <CountCell value={info.row.original.paidClubs ?? 0} />,
  }),
  colHelper.display({
    id: 'paidDelta',
    header: meta.paidDelta.label,
    cell: info => (
      <SignedDelta value={netClubGrowth(info.row.original, tableMeta(info))} />
    ),
  }),
  colHelper.display({
    id: 'paymentsBase',
    header: meta.paymentsBase.label,
    cell: info => <CountCell value={info.row.original.paymentBase ?? 0} />,
  }),
  colHelper.accessor(d => d.totalPayments, {
    id: 'payments',
    header: meta.payments.label,
    cell: info => <CountCell value={info.row.original.totalPayments ?? 0} />,
  }),
  colHelper.display({
    id: 'paymentsDelta',
    header: meta.paymentsDelta.label,
    cell: info => (
      <SignedDelta
        value={
          (info.row.original.totalPayments ?? 0) -
          (info.row.original.paymentBase ?? 0)
        }
      />
    ),
  }),
  colHelper.display({
    id: 'distBase',
    header: meta.distBase.label,
    // Year-cumulative: every July 1 the count resets, so the base is 0
    // (lesson 57) and the change equals the count.
    cell: () => <CountCell value={0} />,
  }),
  colHelper.accessor(d => d.distinguishedClubs, {
    id: 'distinguished',
    header: meta.distinguished.label,
    cell: info => (
      <DistinguishedCount
        confirmed={info.row.original.distinguishedClubs ?? 0}
        provisional={info.row.original.distinguishedProvisional}
      />
    ),
  }),
  colHelper.display({
    id: 'distDelta',
    header: meta.distDelta.label,
    cell: info => (
      <SignedDelta value={info.row.original.distinguishedClubs ?? 0} />
    ),
  }),
  colHelper.display({
    id: 'toPaid',
    header: meta.toPaid.label,
    cell: info => (
      <CountdownValue
        district={info.row.original}
        meta={tableMeta(info)}
        metric="paidClubsRemaining"
      />
    ),
  }),
  colHelper.display({
    id: 'toPayments',
    header: meta.toPayments.label,
    cell: info => (
      <CountdownValue
        district={info.row.original}
        meta={tableMeta(info)}
        metric="paymentsRemaining"
      />
    ),
  }),
  colHelper.display({
    id: 'toDist',
    header: meta.toDist.label,
    cell: info => (
      <CountdownValue
        district={info.row.original}
        meta={tableMeta(info)}
        metric="distinguishedClubsRemaining"
      />
    ),
  }),
  colHelper.display({
    id: 'education',
    header: meta.education.label,
    cell: info => (
      <CountdownValue
        district={info.row.original}
        meta={tableMeta(info)}
        metric="educationTraining"
      />
    ),
  }),
  colHelper.display({
    id: 'cgd',
    header: meta.cgd.label,
    cell: info => (
      <CountdownValue
        district={info.row.original}
        meta={tableMeta(info)}
        metric="clubGrowth"
      />
    ),
  }),
  colHelper.display({
    id: 'tier',
    header: meta.tier.label,
    cell: info => (
      <TierCell district={info.row.original} meta={tableMeta(info)} />
    ),
  }),
])
