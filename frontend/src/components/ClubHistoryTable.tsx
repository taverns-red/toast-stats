/**
 * ClubHistoryTable (#1229, epic #1228) — one row per program year for a single
 * club's multi-year story (DCP, Distinguished tier, membership, renewals,
 * status).
 *
 * Comparison-across-rows table: its value is reading years against each other
 * ("declining / recovering / stable"), so per Lesson 105 it stays a TABLE and
 * uses a keyboard-operable horizontal-scroll region rather than card-collapse.
 * The program-year column is sticky so rows stay labelled while metrics scroll.
 *
 * Tier badge colours and dark-mode are owned by `club-history.css` themed
 * variables (R10 — CSS-level overrides), NOT Tailwind prefers-color-scheme
 * variants (which misfire under this app's manual `[data-theme='dark']`
 * toggle — Lesson 107). Dark styling is scoped to that toggle in the CSS.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ClubHistoryRow, ClubTierCode } from '../utils/clubHistory'
import { EM_DASH } from '../utils/clubHistory'
import { SortableHeader } from './SortableHeader'
import type { SortDirection } from '../hooks/useUrlSort'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import { lifecycleDistrictLabel } from '../utils/clubLifecycle'

type SortField = 'year' | 'dcpGoals' | 'tier' | 'membershipNet' | 'status'

/** Sort rank for the distinguished tier (none < D < S < P < Smedley). */
const TIER_RANK: Record<ClubTierCode, number> = { D: 1, S: 2, P: 3, M: 4 }
function tierRank(code: ClubTierCode | null): number {
  return code ? TIER_RANK[code] : 0
}

/** Modifier class for the tier badge; null renders an em-dash, no badge. */
const TIER_MODIFIER: Record<ClubTierCode, string> = {
  D: 'club-history-tier--distinguished',
  S: 'club-history-tier--select',
  P: 'club-history-tier--presidents',
  M: 'club-history-tier--smedley',
}

function num(value: number | null): string {
  return value == null ? EM_DASH : String(value)
}

function signedNet(value: number | null): string {
  if (value == null) return EM_DASH
  return value > 0 ? `+${value}` : String(value)
}

/* Phone tier chip (#1834): a phone metric column holds ~80px of content, so
   "President's Distinguished" can never fit (it clipped as "President's
   Disting…" — Lesson 134). The chip shows a short label; the full name is
   the tooltip and the screen-reader text. */
const TIER_SHORT: Record<ClubTierCode, string> = {
  D: 'Dist.',
  S: 'Select',
  P: 'Pres.',
  M: 'Smedley',
}

const PHONE_METRICS: PriorityMetric<ClubHistoryRow, SortField>[] = [
  {
    id: 'dcpGoals',
    label: 'DCP',
    title: 'DCP goals met, of 10',
    sortField: 'dcpGoals',
    render: r => (r.dcpGoals == null ? EM_DASH : `${r.dcpGoals} / 10`),
  },
  {
    id: 'tier',
    label: 'Tier',
    title: 'Distinguished tier',
    sortField: 'tier',
    render: r =>
      r.tierCode ? (
        <span
          className={`priority-columns__tier ${TIER_MODIFIER[r.tierCode]}`}
          title={r.tierLabel}
        >
          <span aria-hidden="true">{TIER_SHORT[r.tierCode]}</span>
          <span className="sr-only">{r.tierLabel}</span>
        </span>
      ) : (
        <span className="club-history-muted">{EM_DASH}</span>
      ),
  },
  {
    id: 'membership',
    label: 'Members',
    title: 'Membership, base → end of year, with net change',
    sortField: 'membershipNet',
    render: r =>
      r.membershipBase == null && r.membershipEnd == null ? (
        EM_DASH
      ) : (
        <>
          <span className="block">
            {num(r.membershipBase)} → {num(r.membershipEnd)}
          </span>
          <span
            className={`block ${
              r.membershipNet != null && r.membershipNet < 0
                ? 'club-history-net club-history-net--neg'
                : 'club-history-net club-history-net--pos'
            }`}
          >
            {signedNet(r.membershipNet)}
          </span>
        </>
      ),
  },
  {
    id: 'renewals',
    label: 'Renewals',
    title: 'Renewals, October / April',
    render: r => `${num(r.octoberRenewals)} / ${num(r.aprilRenewals)}`,
  },
  {
    id: 'status',
    label: 'Status',
    sortField: 'status',
    render: r => r.clubStatus ?? EM_DASH,
  },
]

export interface ClubHistoryTableProps {
  rows: ClubHistoryRow[]
  clubName: string
  /** When provided (#1302), each year label becomes a deep link to
   *  ClubDetailPage focused on that program year (`?py=<startYear>`), so a user
   *  reading the multi-year table can jump into a single year. Omitted → plain
   *  text (keeps the component usable outside a Router).
   *
   *  #1803 — a row now knows its district (the club-district history), so
   *  the link goes straight to the club page in THAT year's district. A row
   *  without one keeps the district-agnostic `/club/:clubId` route (#1441),
   *  which resolves the district itself. Never the page's district: after the
   *  2026-07-01 reformation it is not a fact about the club's 2022 row. */
  clubId?: string | undefined
  /** #1803 — show each row's district (the page sets it when they vary). */
  showDistrict?: boolean
}

/* #1803 (Ron, 2026-10-15) — the current program year is read from its
   latest snapshot so far, not a year-end: say so in words. */
function InProgressTag() {
  return <span className="club-history-in-progress">in progress</span>
}

/** Where a row's year label links: that year's district when known. */
function yearHref(clubId: string, row: ClubHistoryRow): string {
  return row.districtId
    ? `/district/${row.districtId}/club/${clubId}?py=${row.startYear}`
    : `/club/${clubId}?py=${row.startYear}`
}

export function ClubHistoryTable({
  rows,
  clubName,
  clubId,
  showDistrict = false,
}: ClubHistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const currentSort = { field: sortField, direction: sortDirection }

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      // Year defaults to newest-first; the rest read most-naturally ascending.
      setSortDirection(field === 'year' ? 'desc' : 'asc')
    }
  }

  const sortedRows = useMemo(() => {
    const keyed = (r: ClubHistoryRow): number | string => {
      switch (sortField) {
        case 'year':
          return r.startYear
        case 'dcpGoals':
          return r.dcpGoals ?? -1
        case 'tier':
          return tierRank(r.tierCode)
        case 'membershipNet':
          return r.membershipNet ?? Number.NEGATIVE_INFINITY
        case 'status':
          return r.clubStatus ?? ''
      }
    }
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const ka = keyed(a)
      const kb = keyed(b)
      if (ka < kb) return -1 * dir
      if (ka > kb) return 1 * dir
      // Stable tiebreak on program year (newest first) so equal keys are deterministic.
      return b.startYear - a.startYear
    })
  }, [rows, sortField, sortDirection])

  const fullTable = (
    <table className="club-history-table">
      <caption className="sr-only">
        {clubName} performance by program year
      </caption>
      <thead>
        <tr>
          <SortableHeader<SortField>
            field="year"
            label="Program Year"
            currentSort={currentSort}
            onSort={handleSort}
            thClassName="club-history-th"
            buttonClassName="club-history-sort"
          />
          {showDistrict && (
            <th scope="col" className="club-history-th">
              District
            </th>
          )}
          <SortableHeader<SortField>
            field="dcpGoals"
            label="DCP Goals"
            currentSort={currentSort}
            onSort={handleSort}
            thClassName="club-history-th club-history-th--num"
            buttonClassName="club-history-sort club-history-sort--num"
            numeric
          />
          <SortableHeader<SortField>
            field="tier"
            label="Distinguished"
            currentSort={currentSort}
            onSort={handleSort}
            thClassName="club-history-th"
            buttonClassName="club-history-sort"
          />
          <SortableHeader<SortField>
            field="membershipNet"
            label="Membership (base → end)"
            currentSort={currentSort}
            onSort={handleSort}
            thClassName="club-history-th club-history-th--num"
            buttonClassName="club-history-sort club-history-sort--num"
            numeric
          />
          <th scope="col" className="club-history-th club-history-th--num">
            Renewals (Oct / Apr)
          </th>
          <SortableHeader<SortField>
            field="status"
            label="Status"
            currentSort={currentSort}
            onSort={handleSort}
            thClassName="club-history-th"
            buttonClassName="club-history-sort"
          />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map(row => (
          <tr key={row.startYear}>
            <th scope="row" className="club-history-td club-history-td--year">
              {clubId ? (
                <Link
                  to={yearHref(clubId, row)}
                  className="club-history-year-link"
                >
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
              {row.inProgress && <InProgressTag />}
            </th>
            {showDistrict && (
              <td className="club-history-td">
                {row.districtId
                  ? lifecycleDistrictLabel(row.districtId)
                  : EM_DASH}
              </td>
            )}
            <td className="club-history-td club-history-td--num">
              {row.dcpGoals == null ? EM_DASH : `${row.dcpGoals} / 10`}
            </td>
            <td className="club-history-td">
              {row.tierCode ? (
                <span
                  className={`club-history-tier ${TIER_MODIFIER[row.tierCode]}`}
                >
                  {row.tierLabel}
                </span>
              ) : (
                <span className="club-history-muted">{EM_DASH}</span>
              )}
            </td>
            <td className="club-history-td club-history-td--num">
              {row.membershipBase == null && row.membershipEnd == null ? (
                EM_DASH
              ) : (
                <>
                  {num(row.membershipBase)} → {num(row.membershipEnd)}{' '}
                  <span
                    className={
                      row.membershipNet != null && row.membershipNet < 0
                        ? 'club-history-net club-history-net--neg'
                        : 'club-history-net club-history-net--pos'
                    }
                  >
                    ({signedNet(row.membershipNet)})
                  </span>
                </>
              )}
            </td>
            <td className="club-history-td club-history-td--num">
              {num(row.octoberRenewals)} / {num(row.aprilRenewals)}
            </td>
            <td className="club-history-td">{row.clubStatus ?? EM_DASH}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // Below 768 (#1834): year + 2 chosen metrics, no side-scroll, the tier as
  // a short chip that fits its cell (Lesson 134); the complete table moves
  // into the full-screen sheet. ≥768 renders the scroll region unchanged.
  return (
    <PriorityColumnsTable<ClubHistoryRow, SortField>
      label={`${clubName} program-year history`}
      rows={sortedRows}
      rowKey={r => String(r.startYear)}
      identityHeader="Year"
      identitySortField="year"
      renderIdentity={r => (
        <>
          {clubId ? <Link to={yearHref(clubId, r)}>{r.label}</Link> : r.label}
          {r.inProgress && <InProgressTag />}
          {/* #1803 — phones name the year's district under the year. */}
          {showDistrict && r.districtId && (
            <span className="club-history-district">
              {lifecycleDistrictLabel(r.districtId)}
            </span>
          )}
        </>
      )}
      metrics={PHONE_METRICS}
      defaultMetricIds={['dcpGoals', 'tier']}
      sort={currentSort}
      onSort={handleSort}
      fullTableTitle={`${clubName} — all columns`}
      sheetTable={fullTable}
      fullTable={
        <div
          role="region"
          aria-label={`${clubName} program-year history`}
          tabIndex={0}
          className="club-history-scroll"
        >
          {fullTable}
        </div>
      }
    />
  )
}
