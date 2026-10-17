import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { EducationAwardTotals } from '@taverns-red/shared-contracts'
import type {
  RegionEducation,
  RegionEducationDistrictRow,
} from '../utils/regionEducation'
import { useUrlSort } from '../hooks/useUrlSort'
import { SortableHeader } from './SortableHeader'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import {
  ByLevelOrPathSection,
  MatrixSection,
  ProgramBar,
} from './education/EducationBreakdown'

/* Region Education page body (#1810, epic #1781) — the #1801 rollup for
   one region and program year. Same sections as the district page (#1793):
   KPI strip, all-awards bar (Pathways, Legacy, DTM, Other stacked), level
   or path rows (`?by=path`), the Pathways-only level × path matrix. Then
   the years (multi-year bars, Legacy and Pathways stacked) and one row per
   district linking to its own education page; a district without a ledger
   is a row that says "Not available", never zeros. Program year comes from
   the page controls (R3). */

type Available = Extract<RegionEducation, { status: 'available' }>

export interface RegionEducationViewProps {
  education: Available
  region: string
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  trend: { programYear: string; totals: EducationAwardTotals }[]
}

const NOT_MEASURED = 'Not measured'
const fmt = (n: number) => n.toLocaleString()
const shortPy = (py: string) => `${py.slice(0, 4)}-${py.slice(7)}`

const REASONS: Record<string, string> = {
  'no-data': 'TI returned no ledger',
  'no-file': 'no ledger file',
  'no-education-section': 'no education section in the report',
  'program-year-mismatch': 'report is for another program year',
}

/* ── KPI strip ───────────────────────────────────────────────────────── */

const KpiStrip: React.FC<{ e: Available }> = ({ e }) => {
  const k = e.kpis
  const items = [
    { label: 'Awards', value: fmt(k.awards) },
    {
      label: 'Members with an award',
      value:
        k.membersWithAward === null ? NOT_MEASURED : fmt(k.membersWithAward),
    },
    { label: 'DTMs', value: fmt(k.dtms) },
    {
      label: 'Triple Crown',
      value:
        k.tripleCrownAchievers === null
          ? NOT_MEASURED
          : fmt(k.tripleCrownAchievers),
    },
    { label: 'Clubs with an award', value: fmt(k.clubsWithAward) },
  ]
  return (
    <ul className="education-kpis" aria-label="Education at a glance">
      {items.map(i => (
        <li key={i.label} className="education-kpi">
          <span className="education-kpi__label">{i.label}</span>
          <span
            className={`education-kpi__value${i.value === NOT_MEASURED ? ' is-unknown' : ''}`}
          >
            {i.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ── Multi-year bars ─────────────────────────────────────────────────── */

const SEGMENTS = [
  { key: 'pathways', label: 'Pathways' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'dtm', label: 'DTM' },
  { key: 'other', label: 'Other' },
] as const

const YearBars: React.FC<{
  trend: RegionEducationViewProps['trend']
  programYear: string
}> = ({ trend, programYear }) => {
  const max = Math.max(1, ...trend.map(y => y.totals.awards))
  return (
    <section className="education-section" aria-labelledby="edu-years-h">
      <h2 id="edu-years-h" className="education-section__title">
        By program year
      </h2>
      <ul className="education-rows" aria-label="Awards by program year">
        {trend.map(({ programYear: py, totals: t }) => {
          const shown = SEGMENTS.filter(
            s => s.key === 'pathways' || s.key === 'legacy' || t[s.key] > 0
          )
          return (
            <li
              key={py}
              className={`education-row--path education-year${py === programYear ? ' is-current' : ''}`}
              aria-current={py === programYear ? 'true' : undefined}
            >
              <span className="education-row__label">{shortPy(py)}</span>
              <span className="education-row__value">{fmt(t.awards)}</span>
              <span
                className="education-year__track"
                aria-hidden="true"
                style={{ width: `${(t.awards / max) * 100}%` }}
              >
                {SEGMENTS.map(s =>
                  t[s.key] > 0 ? (
                    <span
                      key={s.key}
                      className={`education-stack__seg education-seg--${s.key}`}
                      style={{ flexGrow: t[s.key] }}
                    />
                  ) : null
                )}
              </span>
              <span className="education-year__split">
                {shown.map(s => `${s.label} ${fmt(t[s.key])}`).join(' · ')}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="education-note">
        Each year sums that year&apos;s districts with a ledger, by that
        year&apos;s regions. Legacy awards ended with the move to Pathways.
      </p>
    </section>
  )
}

/* ── Districts ───────────────────────────────────────────────────────── */

type Field =
  'district' | 'awards' | 'pathways' | 'legacy' | 'dtm' | 'clubs' | 'members'
const FIELDS: readonly Field[] = [
  'district',
  'awards',
  'pathways',
  'legacy',
  'dtm',
  'clubs',
  'members',
]

const value = (f: Field, r: RegionEducationDistrictRow): number => {
  if (r.status !== 'available') return -1
  switch (f) {
    case 'district':
      return 0
    case 'awards':
      return r.totals.awards
    case 'pathways':
      return r.totals.pathways
    case 'legacy':
      return r.totals.legacy
    case 'dtm':
      return r.totals.dtm
    case 'clubs':
      return r.clubsWithAward
    case 'members':
      return r.membersWithAward ?? -1
  }
}

const cell = (
  r: RegionEducationDistrictRow,
  get: (
    r: Extract<RegionEducationDistrictRow, { status: 'available' }>
  ) => number | null
) => {
  if (r.status !== 'available') return '—'
  const n = get(r)
  return n === null ? '—' : fmt(n)
}

const METRICS: PriorityMetric<RegionEducationDistrictRow, Field>[] = [
  {
    id: 'awards',
    label: 'Awards',
    sortField: 'awards',
    render: r => cell(r, a => a.totals.awards),
  },
  {
    id: 'pathways',
    label: 'Pathways',
    sortField: 'pathways',
    render: r => cell(r, a => a.totals.pathways),
  },
  {
    id: 'legacy',
    label: 'Legacy',
    sortField: 'legacy',
    render: r => cell(r, a => a.totals.legacy),
  },
  {
    id: 'dtm',
    label: 'DTMs',
    sortField: 'dtm',
    render: r => cell(r, a => a.totals.dtm),
  },
  {
    id: 'clubs',
    label: 'Clubs',
    title: 'Clubs with an award',
    sortField: 'clubs',
    render: r => cell(r, a => a.clubsWithAward),
  },
  {
    id: 'members',
    label: 'Members',
    title: 'Members with an award',
    sortField: 'members',
    render: r => cell(r, a => a.membersWithAward),
  },
]

const TH = 'education-rollup__th'

const Districts: React.FC<{
  e: Available
  region: string
  programYear: string
}> = ({ e, region, programYear }) => {
  const { sort, toggleSort } = useUrlSort<Field>({
    fields: FIELDS,
    defaultField: 'district',
    defaultDirection: 'asc',
    newFieldDirection: 'desc',
  })
  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    const byId = (
      a: RegionEducationDistrictRow,
      b: RegionEducationDistrictRow
    ) => a.id.localeCompare(b.id, undefined, { numeric: true })
    return [...e.districts].sort((a, b) =>
      sort.field === 'district'
        ? byId(a, b) * dir
        : (value(sort.field, a) - value(sort.field, b)) * dir || byId(a, b)
    )
  }, [e.districts, sort])
  const label = `Region ${region} districts, education awards`
  const districtLink = (r: RegionEducationDistrictRow) => (
    <Link
      to={`/district/${r.id}/education?py=${programYear}`}
      className="education-district__link"
    >
      District {r.id}
    </Link>
  )
  const unavailable = (r: RegionEducationDistrictRow) =>
    r.status === 'not-available'
      ? `Not available (${REASONS[r.reason] ?? r.reason})`
      : null
  const header = (field: Field, text: string, numeric = true) => (
    <SortableHeader<Field>
      field={field}
      label={text}
      currentSort={sort}
      onSort={toggleSort}
      thClassName={`${TH}${numeric ? ' text-right' : ' text-left'}`}
      numeric={numeric}
    />
  )
  const fullTable = (
    <table className="education-rollup" aria-label={label}>
      <thead>
        <tr>
          {header('district', 'District', false)}
          {header('awards', 'Awards')}
          {header('pathways', 'Pathways')}
          {header('legacy', 'Legacy')}
          {header('dtm', 'DTMs')}
          {header('clubs', 'Clubs with an award')}
          {header('members', 'Members with an award')}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id}>
            <th scope="row" className="education-rollup__unit">
              {districtLink(r)}
            </th>
            {r.status === 'available' ? (
              <>
                <td>{fmt(r.totals.awards)}</td>
                <td>{fmt(r.totals.pathways)}</td>
                <td>{fmt(r.totals.legacy)}</td>
                <td>{fmt(r.totals.dtm)}</td>
                <td>{fmt(r.clubsWithAward)}</td>
                <td>
                  {r.membersWithAward === null ? '—' : fmt(r.membersWithAward)}
                </td>
              </>
            ) : (
              <td colSpan={6} className="education-district__na">
                {unavailable(r)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <section className="education-section" aria-labelledby="edu-districts-h">
      <h2 id="edu-districts-h" className="education-section__title">
        Districts
      </h2>
      <p className="education-note">
        Select a district for its own education page: levels, paths and its
        divisions and areas.
      </p>
      <PriorityColumnsTable<RegionEducationDistrictRow, Field>
        label={label}
        rows={sorted}
        rowKey={r => r.id}
        identityHeader="District"
        identitySortField="district"
        identityWraps
        renderIdentity={r => (
          <span className="education-district">
            {districtLink(r)}
            {r.status !== 'available' && (
              <span className="education-district__na">{unavailable(r)}</span>
            )}
          </span>
        )}
        metrics={METRICS}
        defaultMetricIds={['awards', 'dtm']}
        sort={sort}
        onSort={toggleSort}
        fullTableTitle={`${label} — all columns`}
        sheetTable={fullTable}
        fullTable={
          <div
            className="education-rollup__scroll"
            role="region"
            tabIndex={0}
            aria-label={`${label} — scroll horizontally to see all columns`}
          >
            {fullTable}
          </div>
        }
      />
    </section>
  )
}

/* ── The view ────────────────────────────────────────────────────────── */

export const RegionEducationView: React.FC<RegionEducationViewProps> = ({
  education: e,
  region,
  programYear,
  trend,
}) => {
  const total = e.coverage.available + e.coverage.notAvailable
  const source =
    e.source.source === 'ledger-history'
      ? 'TI Educational Achievement Archive'
      : `TI education ledger${e.source.sourceDate ? `, as of ${e.source.sourceDate}` : ''}`
  return (
    <div className="education-page">
      <p className="education-provenance" data-testid="education-provenance">
        Source: {source} · {e.coverage.available} of {total} districts with a
        ledger
      </p>
      <KpiStrip e={e} />
      <ProgramBar e={e.summary} />
      <ByLevelOrPathSection e={e.summary} />
      <MatrixSection e={e.summary} />
      {trend.length > 0 && <YearBars trend={trend} programYear={programYear} />}
      <Districts e={e} region={region} programYear={programYear} />
    </div>
  )
}

export default RegionEducationView
