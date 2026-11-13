/**
 * Cell renderers for the region district rankings (#2702). Components only, so
 * the column model in `regionRankingsColumns.tsx` stays a plain module.
 *
 * The DataTable draws the `<td>`; these are its contents. All text is at least
 * 14px (the table's `--dt-font`); no extra-small size classes. Colour is the legacy palette
 * (green and maroon for signed changes, as the KPI cards use).
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { DistrictChipAndName } from './DistrictChipAndName'
import { DistrictTrendSparkline } from './DistrictTrendSparkline'
import {
  getDistinguishedCountdown,
  type CountdownCell,
} from '../utils/distinguishedCountdown'
import type { DistinguishedDistrictTier } from '../services/cdn'
import type {
  RegionRankedDistrict,
  RegionRankingsTableMeta,
} from './regionRankingsTableFeatures'

const countdownOf = (
  d: RegionRankedDistrict,
  meta: RegionRankingsTableMeta
): ReturnType<typeof getDistinguishedCountdown> =>
  getDistinguishedCountdown(d.districtId, meta.awards, {
    paidClubBase: d.paidClubBase ?? 0,
    paymentBase: d.paymentBase ?? 0,
    paidClubs: d.paidClubs ?? 0,
    totalPayments: d.totalPayments ?? 0,
    distinguishedClubs: d.distinguishedClubs ?? 0,
  })

/** Net club growth: the snapshot field when present, else current - base
 *  (lesson 102: signed, never a clamped gap). */
export const netClubGrowth = (
  d: RegionRankedDistrict,
  meta: RegionRankingsTableMeta
): number =>
  meta.awards?.distinguishedDistrict?.[d.districtId]?.netClubGrowth ??
  (d.paidClubs ?? 0) - (d.paidClubBase ?? 0)

export const DistrictCell: React.FC<{ district: RegionRankedDistrict }> = ({
  district,
}) => (
  <Link
    to={`/district/${district.districtId}`}
    className="rankings-district__link"
  >
    <DistrictChipAndName
      districtId={district.districtId}
      name={district.districtName}
      nameClassName="rankings-district__name"
    />
  </Link>
)

export const RankCell: React.FC<{ district: RegionRankedDistrict }> = ({
  district,
}) => (
  <span className="rank-badge">
    #{district.regionRank}
    {district.regionRankTied && (
      <span className="rankings-muted ml-1 font-normal">(tied)</span>
    )}
  </span>
)

export const TrendCell: React.FC<{
  series: number[] | null | undefined
}> = ({ series }) => <DistrictTrendSparkline series={series} />

export const WorldRankCell: React.FC<{ rank: number }> = ({ rank }) => (
  <span className="rankings-muted">#{rank}</span>
)

/** A plain count. */
export const CountCell: React.FC<{ value: number }> = ({ value }) => (
  <>{value.toLocaleString()}</>
)

/** A signed change: growth green +N, loss maroon -N, matching the KPI cards. */
export const SignedDelta: React.FC<{ value: number }> = ({ value }) => (
  <span
    className={`font-semibold ${
      value >= 0 ? 'text-green-700' : 'text-tm-true-maroon'
    }`}
  >
    {value >= 0 ? '+' : ''}
    {value.toLocaleString()}
  </span>
)

const dash = <span className="text-gray-500">{'—'}</span>

/** A remaining-to-Distinguished countdown cell. A count is a plain maroon
 *  number (not a signed change); met is a tick; officer awards are a tick or
 *  a dash. */
const countdownInner = (cell: CountdownCell | null): React.ReactNode => {
  if (!cell) return dash
  if (cell.kind === 'met')
    return <span className="text-green-700 font-semibold">{'✓'}</span>
  if (cell.kind === 'boolean')
    return cell.met ? (
      <span className="text-green-700 font-semibold">{'✓'}</span>
    ) : (
      dash
    )
  return (
    <span className="text-tm-true-maroon font-semibold">
      {cell.value.toLocaleString()}
    </span>
  )
}

export const CountdownValue: React.FC<{
  district: RegionRankedDistrict
  meta: RegionRankingsTableMeta
  metric: keyof NonNullable<ReturnType<typeof getDistinguishedCountdown>>
}> = ({ district, meta, metric }) => {
  const c = countdownOf(district, meta)
  return <>{countdownInner(c?.[metric] ?? null)}</>
}

type AchievedTier = Exclude<
  DistinguishedDistrictTier,
  'NotDistinguished' | 'Unknown'
>

/* The achieved tier as a plain label; tints stay on the legacy palette. */
const TIER_LABEL: Record<AchievedTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  Presidents: "President's",
  Smedley: 'Smedley',
}

const TIER_CLASS: Record<AchievedTier, string> = {
  Distinguished: 'bg-tm-true-maroon text-white',
  Select: 'bg-tm-cool-gray text-gray-900',
  Presidents: 'bg-tm-happy-yellow text-gray-900',
  Smedley: 'bg-purple-200 text-purple-900',
}

export const TierCell: React.FC<{
  district: RegionRankedDistrict
  meta: RegionRankingsTableMeta
}> = ({ district, meta }) => {
  const tier =
    meta.awards?.distinguishedDistrict?.[district.districtId]?.currentTier ??
    null
  if (!tier || tier === 'NotDistinguished' || tier === 'Unknown') return dash
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-semibold ${TIER_CLASS[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}
