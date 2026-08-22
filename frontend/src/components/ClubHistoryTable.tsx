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

export interface ClubHistoryTableProps {
  rows: ClubHistoryRow[]
  clubName: string
  /** When provided (#1302), each year label becomes a deep link to
   *  ClubDetailPage focused on that program year (`?py=<startYear>`), so a user
   *  reading the multi-year table can jump into a single year. Omitted → plain
   *  text (keeps the component usable outside a Router).
   *
   *  #1441 — the link is the district-agnostic `/club/:clubId` route, which
   *  resolves the club's district from the club index. A row knows its program
   *  year but not its district: districts were reformed on 2026-07-01 and
   *  clubs moved between them, so the page's current district is not a fact
   *  about the club's 2022 row. No `districtId` prop, by design. */
  clubId?: string | undefined
}

export function ClubHistoryTable({
  rows,
  clubName,
  clubId,
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

  return (
    <div
      role="region"
      aria-label={`${clubName} program-year history`}
      tabIndex={0}
      className="club-history-scroll"
    >
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
                    to={`/club/${clubId}?py=${row.startYear}`}
                    className="club-history-year-link"
                  >
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </th>
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
    </div>
  )
}
