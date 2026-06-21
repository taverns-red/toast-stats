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
 * variables (R10 — CSS-level overrides), NOT Tailwind `dark:` variants (which
 * misfire under this app's manual `[data-theme='dark']` toggle — Lesson 107).
 */

import { useMemo, useState } from 'react'
import type { ClubHistoryRow, ClubTierCode } from '../utils/clubHistory'

const EM_DASH = '—'

type SortField = 'year' | 'dcpGoals' | 'tier' | 'membershipNet' | 'status'
type SortDirection = 'asc' | 'desc'

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

interface SortableHeaderProps {
  field: SortField
  label: string
  active: SortField
  direction: SortDirection
  onSort: (field: SortField) => void
  numeric?: boolean
}

function SortableHeader({
  field,
  label,
  active,
  direction,
  onSort,
  numeric,
}: SortableHeaderProps) {
  const isActive = active === field
  return (
    <th
      scope="col"
      className={
        numeric ? 'club-history-th club-history-th--num' : 'club-history-th'
      }
      aria-sort={
        isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className="club-history-sort"
        onClick={() => onSort(field)}
      >
        {label}
        <span aria-hidden="true" className="club-history-sort__icon">
          {isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export interface ClubHistoryTableProps {
  rows: ClubHistoryRow[]
  clubName: string
}

export function ClubHistoryTable({ rows, clubName }: ClubHistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

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
            <SortableHeader
              field="year"
              label="Program Year"
              active={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              field="dcpGoals"
              label="DCP Goals"
              active={sortField}
              direction={sortDirection}
              onSort={handleSort}
              numeric
            />
            <SortableHeader
              field="tier"
              label="Distinguished"
              active={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              field="membershipNet"
              label="Membership (base → end)"
              active={sortField}
              direction={sortDirection}
              onSort={handleSort}
              numeric
            />
            <th scope="col" className="club-history-th club-history-th--num">
              Renewals (Oct / Apr)
            </th>
            <SortableHeader
              field="status"
              label="Status"
              active={sortField}
              direction={sortDirection}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(row => (
            <tr key={row.startYear}>
              <th scope="row" className="club-history-td club-history-td--year">
                {row.label}
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
