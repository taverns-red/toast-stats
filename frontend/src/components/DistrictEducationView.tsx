import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  DistrictEducation,
  EducationRollupRow,
} from '../utils/districtEducation'
import { useParamHref } from '../hooks/useParamHref'
import { useUrlSort } from '../hooks/useUrlSort'
import {
  ByLevelOrPathSection,
  MatrixSection,
  SwitchLinks,
} from './education/EducationBreakdown'
import { EducationTimelineSection } from './education/EducationTimelineSection'
import {
  EducationRollupTable,
  type EducationRollupColumn,
} from './education/EducationRollupTable'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'

/* District Education page body (#1793, epic #1781). Ledger only: every
   figure comes from buildDistrictEducation over the reports dataset.

   - KPI strip: awards, members with an award, DTMs, Triple Crown, awards per
     base member. A figure the dataset does not carry reads "Not measured".
   - Awards over time (#2592): the cumulative levels / paths step chart,
     last year as a ghost line; its legend carries the old all-awards bar's
     names and values. "Not available yet" keeps that bar.
   - Level rows (default) or path rows (`?by=path`): same route, URL state,
     plain links — no tabs (ADR-005). A level row expands into path chips.
   - Level × path matrix, Pathways only: inline at ≥768, behind "Open
     matrix" in a full-screen sheet below. A cell tap highlights its row and
     column and prints a readout line.
   - Division / area rollup (`?rollup=area`) on the shared priority-column
     table + SortableHeader, sort in the URL.
   Bars are aria-hidden decoration; the number is always printed. */

export interface DistrictEducationViewProps {
  education: DistrictEducation
  /** The snapshot the page is showing (from the page controls, R3). */
  snapshotDate: string
  /** The viewed PY is older than the district's newest one (page-decided). */
  isPriorProgramYear: boolean
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  districtId: string
}

const SOURCE_LABELS: Record<string, string> = {
  'education-archive': 'TI Educational Achievement Archive',
}
const DEFAULT_SOURCE_LABEL = 'TI Education Achievements report'

const NOT_MEASURED = 'Not measured'
const fmt = (n: number) => n.toLocaleString()

type Available = Extract<DistrictEducation, { status: 'available' }>

/* ── KPI strip ───────────────────────────────────────────────────────── */

const KpiStrip: React.FC<{ e: Available }> = ({ e }) => {
  const k = e.kpis
  const items: { label: string; value: string; hint?: string }[] = [
    { label: 'Awards this year', value: fmt(k.awards) },
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
    {
      label: 'Awards per base member',
      value:
        k.awardsPerBaseMember === null
          ? NOT_MEASURED
          : k.awardsPerBaseMember.toFixed(2),
      ...(k.baseMembers !== null && {
        hint: `${fmt(k.awards)} awards ÷ ${fmt(k.baseMembers)} base members`,
      }),
    },
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
          {i.hint && <span className="education-kpi__hint">{i.hint}</span>}
        </li>
      ))}
    </ul>
  )
}

/* ── Division / area rollup ──────────────────────────────────────────── */

type RollupField =
  'unit' | 'awards' | 'pathways' | 'dtm' | 'members' | 'clubs' | 'perBase'
const ROLLUP_FIELDS: readonly RollupField[] = [
  'unit',
  'awards',
  'pathways',
  'dtm',
  'members',
  'clubs',
  'perBase',
]

const rollupValue = (f: RollupField, r: EducationRollupRow): number => {
  switch (f) {
    case 'unit':
      return 0
    case 'awards':
      return r.awards
    case 'pathways':
      return r.pathways
    case 'dtm':
      return r.dtm
    case 'members':
      return r.membersWithAward ?? -1
    case 'clubs':
      return r.clubsWithAward
    case 'perBase':
      return r.awardsPerBaseMember ?? -1
  }
}

const unitName = (r: EducationRollupRow, level: 'division' | 'area') =>
  level === 'division' ? `Division ${r.id}` : `Area ${r.divisionId}${r.id}`

const perBase = (r: EducationRollupRow) =>
  r.awardsPerBaseMember === null ? '—' : r.awardsPerBaseMember.toFixed(2)
const members = (r: EducationRollupRow) =>
  r.membersWithAward === null ? '—' : fmt(r.membersWithAward)

const ROLLUP_METRICS: PriorityMetric<EducationRollupRow, RollupField>[] = [
  {
    id: 'awards',
    label: 'Awards',
    sortField: 'awards',
    render: r => fmt(r.awards),
  },
  {
    id: 'members',
    label: 'Members',
    title: 'Members with an award',
    sortField: 'members',
    render: members,
  },
  {
    id: 'perBase',
    label: 'Per base',
    title: 'Awards per base member',
    sortField: 'perBase',
    render: perBase,
  },
  { id: 'dtm', label: 'DTMs', sortField: 'dtm', render: r => fmt(r.dtm) },
  {
    id: 'clubs',
    label: 'Clubs',
    title: 'Clubs with an award',
    sortField: 'clubs',
    render: r => fmt(r.clubsWithAward),
  },
]

const Rollup: React.FC<{ e: Available }> = ({ e }) => {
  const [params] = useSearchParams()
  const href = useParamHref()
  const level: 'division' | 'area' =
    params.get('rollup') === 'area' ? 'area' : 'division'
  const rows = level === 'division' ? e.divisions : e.areas
  const { sort, toggleSort } = useUrlSort<RollupField>({
    fields: ROLLUP_FIELDS,
    defaultField: 'unit',
    defaultDirection: 'asc',
    newFieldDirection: 'desc',
  })
  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) =>
      sort.field === 'unit'
        ? a.key.localeCompare(b.key, undefined, { numeric: true }) * dir
        : (rollupValue(sort.field, a) - rollupValue(sort.field, b)) * dir ||
          a.key.localeCompare(b.key, undefined, { numeric: true })
    )
  }, [rows, sort])
  const label = `Education by ${level}`
  const columns = useMemo<EducationRollupColumn<EducationRollupRow>[]>(
    () => [
      {
        id: 'unit',
        header: level === 'division' ? 'Division' : 'Area',
        cell: r => unitName(r, level),
      },
      { id: 'awards', header: 'Awards', cell: r => fmt(r.awards) },
      { id: 'pathways', header: 'Pathways', cell: r => fmt(r.pathways) },
      { id: 'dtm', header: 'DTMs', cell: r => fmt(r.dtm) },
      { id: 'members', header: 'Members with an award', cell: members },
      {
        id: 'clubs',
        header: 'Clubs with an award',
        cell: r => fmt(r.clubsWithAward),
      },
      {
        id: 'perBase',
        header: 'Awards per base member',
        cell: perBase,
        size: 140,
      },
    ],
    [level]
  )
  const fullTable = (inScroller: boolean) => (
    <EducationRollupTable<EducationRollupRow>
      rows={sorted}
      columns={columns}
      getRowId={r => r.key}
      sort={sort}
      onSort={f => toggleSort(f as RollupField)}
      id={
        inScroller ? 'education-rollup-sheet-table' : 'education-rollup-table'
      }
      label={label}
      caption={`${label}, ${sorted.length} ${
        sorted.length === 1 ? level : `${level}s`
      }. Column headers with buttons are sortable.`}
      inScroller={inScroller}
    />
  )
  return (
    <section
      className="education-section"
      aria-label="Division and area rollup"
    >
      <h3 className="education-section__title">By division and area</h3>
      <SwitchLinks
        label="Rollup level"
        options={[
          {
            label: 'Divisions',
            href: href('rollup', null),
            current: level === 'division',
          },
          {
            label: 'Areas',
            href: href('rollup', 'area'),
            current: level === 'area',
          },
        ]}
      />
      <PriorityColumnsTable<EducationRollupRow, RollupField>
        label={label}
        rows={sorted}
        rowKey={r => r.key}
        identityHeader={level === 'division' ? 'Division' : 'Area'}
        identitySortField="unit"
        renderIdentity={r => <span>{unitName(r, level)}</span>}
        metrics={ROLLUP_METRICS}
        defaultMetricIds={['awards', 'perBase']}
        sort={sort}
        onSort={toggleSort}
        fullTableTitle={`${label} — all columns`}
        sheetTable={fullTable(true)}
        fullTable={fullTable(false)}
      />
    </section>
  )
}

/* ── The view ────────────────────────────────────────────────────────── */

export const DistrictEducationView: React.FC<DistrictEducationViewProps> = ({
  education,
  snapshotDate,
  isPriorProgramYear,
  programYear,
  districtId,
}) => {
  if (education.status !== 'available') {
    return (
      <div className="education-page">
        <h2 className="education-page__title">Education awards</h2>
        <p role="status" className="education-empty">
          {isPriorProgramYear
            ? 'No education report for this date. For past program years, education awards are shown on the June 30 year-end snapshot.'
            : 'No education report for this date yet. This is not zero awards — the report has not been collected for this snapshot.'}
        </p>
      </div>
    )
  }

  const e = education
  const sourceLabel = SOURCE_LABELS[e.source.reportType] ?? DEFAULT_SOURCE_LABEL
  return (
    <div className="education-page">
      <h2 className="education-page__title">Education awards</h2>
      <p className="education-page__subtitle">
        Every award in Toastmasters&apos; education ledger this program year to
        date — Pathways levels, DTMs and any legacy awards.
      </p>
      <p className="education-provenance" data-testid="education-provenance">
        Source: {sourceLabel}
        {e.source.asOf ? `, as of ${e.source.asOf}` : ''} · snapshot{' '}
        {snapshotDate}
      </p>

      <KpiStrip e={e} />
      <EducationTimelineSection
        programYear={programYear}
        kind="district"
        id={districtId}
        through={snapshotDate}
        tilesTotal={e.kpis.awards}
        tilesAsOf={snapshotDate}
        summary={e}
      />

      <ByLevelOrPathSection e={e} />

      <MatrixSection e={e} />
      <Rollup e={e} />
    </div>
  )
}

export default DistrictEducationView
