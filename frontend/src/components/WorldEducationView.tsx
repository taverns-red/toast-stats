import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type {
  WorldEducation,
  WorldEducationRegionRow,
} from '../utils/worldEducation'
import type { EducationTrendYear } from '../utils/educationTrend'
import { useUrlSort } from '../hooks/useUrlSort'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import {
  ByLevelOrPathSection,
  MatrixSection,
} from './education/EducationBreakdown'
import { EducationTimelineSection } from './education/EducationTimelineSection'
import {
  EducationRollupTable,
  type EducationRollupColumn,
} from './education/EducationRollupTable'
import { EducationYearBars } from './education/EducationYearBars'
import { KpiStrip } from './RegionEducationView'

/* World Education page body (#1811, epic #1781) — the #1801 rollup's world
   block for one program year. The region page's sections (#1810): KPI
   strip, awards over time (#2592), level or path rows (`?by=path`), the Pathways-only
   matrix, the years; then one row per region linking to its own education
   page, with how many of its districts had a ledger. A region with none is
   a row that says "Not available", never zeros. Program year comes from
   the page controls (R3). */

type Available = Extract<WorldEducation, { status: 'available' }>

export interface WorldEducationViewProps {
  education: Available
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  trend: EducationTrendYear[]
}

const fmt = (n: number) => n.toLocaleString()

/* ── Regions ─────────────────────────────────────────────────────────── */

type Field =
  | 'region'
  | 'awards'
  | 'pathways'
  | 'legacy'
  | 'dtm'
  | 'clubs'
  | 'members'
  | 'districts'
const FIELDS: readonly Field[] = [
  'region',
  'awards',
  'pathways',
  'legacy',
  'dtm',
  'clubs',
  'members',
  'districts',
]

const value = (f: Field, r: WorldEducationRegionRow): number => {
  if (f === 'districts') return r.districts.available
  if (r.status !== 'available') return -1
  switch (f) {
    case 'region':
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

type AvailableRow = Extract<WorldEducationRegionRow, { status: 'available' }>

const cell = (
  r: WorldEducationRegionRow,
  get: (r: AvailableRow) => number | null
) => {
  if (r.status !== 'available') return '—'
  const n = get(r)
  return n === null ? '—' : fmt(n)
}

const coverage = (r: WorldEducationRegionRow) =>
  `${r.districts.available} of ${r.districts.available + r.districts.notAvailable}`

const METRICS: PriorityMetric<WorldEducationRegionRow, Field>[] = [
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
  {
    id: 'districts',
    label: 'Districts',
    title: 'Districts with a ledger',
    sortField: 'districts',
    render: coverage,
  },
]

/** Full header text for each figure column (the phone chips use the short
 *  label; the table spells it out). */
const COLUMN_HEADERS: Record<string, string> = {
  awards: 'Awards',
  pathways: 'Pathways',
  legacy: 'Legacy',
  dtm: 'DTMs',
  clubs: 'Clubs with an award',
  members: 'Members with an award',
  districts: 'Districts with a ledger',
}
const UNAVAILABLE = 'Not available (no district with a ledger)'

const Regions: React.FC<{
  rows: WorldEducationRegionRow[]
  programYear: string
}> = ({ rows, programYear }) => {
  const { sort, toggleSort } = useUrlSort<Field>({
    fields: FIELDS,
    defaultField: 'region',
    defaultDirection: 'asc',
    newFieldDirection: 'desc',
  })
  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    const byId = (a: WorldEducationRegionRow, b: WorldEducationRegionRow) =>
      a.id.localeCompare(b.id, undefined, { numeric: true })
    return [...rows].sort((a, b) =>
      sort.field === 'region'
        ? byId(a, b) * dir
        : (value(sort.field, a) - value(sort.field, b)) * dir || byId(a, b)
    )
  }, [rows, sort])
  const label = 'Regions, education awards'
  const regionLink = (r: WorldEducationRegionRow) => (
    <Link
      to={`/region/${r.id}/education?py=${programYear}`}
      className="education-district__link"
    >
      Region {r.id}
    </Link>
  )
  const columns: EducationRollupColumn<WorldEducationRegionRow>[] = [
    {
      id: 'region',
      header: 'Region',
      cell: r => (
        <span className="education-district">
          {regionLink(r)}
          {r.status !== 'available' && (
            <span className="education-district__na">{UNAVAILABLE}</span>
          )}
        </span>
      ),
    },
    ...METRICS.map(m => ({
      id: m.sortField!,
      header: COLUMN_HEADERS[m.id]!,
      cell: m.render,
    })),
  ]
  const fullTable = (inScroller: boolean) => (
    <EducationRollupTable<WorldEducationRegionRow>
      rows={sorted}
      columns={columns}
      getRowId={r => r.id}
      sort={sort}
      onSort={f => toggleSort(f as Field)}
      id={
        inScroller ? 'education-regions-sheet-table' : 'education-regions-table'
      }
      label={label}
      caption={`${label}, ${sorted.length} ${
        sorted.length === 1 ? 'region' : 'regions'
      }. Column headers with buttons are sortable.`}
      inScroller={inScroller}
    />
  )
  return (
    <PriorityColumnsTable<WorldEducationRegionRow, Field>
      label={label}
      rows={sorted}
      rowKey={r => r.id}
      identityHeader="Region"
      identitySortField="region"
      identityWraps
      renderIdentity={r => (
        <span className="education-district">
          {regionLink(r)}
          {r.status !== 'available' && (
            <span className="education-district__na">{UNAVAILABLE}</span>
          )}
        </span>
      )}
      metrics={METRICS}
      defaultMetricIds={['awards', 'dtm']}
      sort={sort}
      onSort={toggleSort}
      fullTableTitle={`${label} — all columns`}
      sheetTable={fullTable(true)}
      fullTable={fullTable(false)}
    />
  )
}

const RegionsSection: React.FC<{ e: Available; programYear: string }> = ({
  e,
  programYear,
}) => {
  const unassigned = e.unassigned
  return (
    <section className="education-section" aria-labelledby="edu-regions-h">
      <h2 id="edu-regions-h" className="education-section__title">
        Regions
      </h2>
      {e.regions === null ? (
        <p
          className="education-note"
          data-testid="education-regions-unavailable"
        >
          Education awards by region are not available for {programYear}: region
          membership is recorded from 2016-17 on. The worldwide totals above
          count every district with a ledger.
        </p>
      ) : (
        <>
          <p className="education-note">
            Select a region for its own education page: its districts, levels
            and paths.
          </p>
          <Regions rows={e.regions} programYear={programYear} />
          {unassigned.length > 0 && (
            <p className="education-note" data-testid="education-unassigned">
              {unassigned.length === 1 ? 'District' : 'Districts'}{' '}
              {unassigned.join(', ')} {unassigned.length === 1 ? 'is' : 'are'}{' '}
              in no region this year;{' '}
              {unassigned.length === 1 ? 'its' : 'their'} awards count in the
              worldwide totals only.
            </p>
          )}
        </>
      )}
    </section>
  )
}

/* ── The view ────────────────────────────────────────────────────────── */

export const WorldEducationView: React.FC<WorldEducationViewProps> = ({
  education: e,
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
      <EducationTimelineSection
        programYear={programYear}
        kind="world"
        id={null}
        through={e.source.sourceDate}
        tilesTotal={e.kpis.awards}
        tilesAsOf={e.source.sourceDate}
        summary={e.summary}
      />
      <ByLevelOrPathSection e={e.summary} />
      <MatrixSection e={e.summary} />
      {trend.length > 0 && (
        <EducationYearBars
          years={trend}
          programYear={programYear}
          note={
            <>
              Each year sums that year&apos;s districts with a ledger,
              worldwide. Legacy awards ended with the move to Pathways.
            </>
          }
        />
      )}
      <RegionsSection e={e} programYear={programYear} />
    </div>
  )
}

export default WorldEducationView
