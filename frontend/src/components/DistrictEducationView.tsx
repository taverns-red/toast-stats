import React, { useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  DistrictEducation,
  EducationPathRow,
  EducationRollupRow,
} from '../utils/districtEducation'
import { useIsMobile } from '../hooks/useIsMobile'
import { useUrlSort } from '../hooks/useUrlSort'
import { SortableHeader } from './SortableHeader'
import { BottomSheet } from './BottomSheet'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'

/* District Education page body (#1793, epic #1781). Ledger only: every
   figure comes from buildDistrictEducation over the reports dataset.

   - KPI strip: awards, members with an award, DTMs, Triple Crown, awards per
     base member. A figure the dataset does not carry reads "Not measured".
   - All-awards bar: Pathways, Legacy, DTM and Other stacked, values as text.
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
}

const SOURCE_LABELS: Record<string, string> = {
  'education-archive': 'TI Educational Achievement Archive',
}
const DEFAULT_SOURCE_LABEL = 'TI Education Achievements report'

const NOT_MEASURED = 'Not measured'
const fmt = (n: number) => n.toLocaleString()
const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0%'

type Available = Extract<DistrictEducation, { status: 'available' }>

/* ── Search-param links ──────────────────────────────────────────────── */

function useParamHref(): (key: string, value: string | null) => string {
  const [params] = useSearchParams()
  return (key, value) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    // A sort is per rollup level; switching level starts that table fresh.
    if (key === 'rollup') {
      next.delete('sort')
      next.delete('dir')
    }
    const s = next.toString()
    return s ? `?${s}` : '?'
  }
}

const SwitchLinks: React.FC<{
  label: string
  options: { label: string; href: string; current: boolean }[]
}> = ({ label, options }) => (
  <nav aria-label={label} className="education-switch">
    {options.map(o => (
      <Link
        key={o.label}
        to={o.href}
        replace
        preventScrollReset
        aria-current={o.current ? 'true' : undefined}
        className={`education-switch__link${o.current ? ' is-current' : ''}`}
      >
        {o.label}
      </Link>
    ))}
  </nav>
)

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

/* ── All awards by program ───────────────────────────────────────────── */

const PROGRAMS = [
  { key: 'pathways', label: 'Pathways' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'dtm', label: 'DTM' },
  { key: 'other', label: 'Other' },
] as const

const ProgramBar: React.FC<{ e: Available }> = ({ e }) => {
  const t = e.totals
  const shown = PROGRAMS.filter(
    p => p.key === 'pathways' || p.key === 'legacy' || t[p.key] > 0
  )
  return (
    <div className="education-programs">
      <div className="education-stack" aria-hidden="true">
        {shown.map(p =>
          t[p.key] > 0 ? (
            <span
              key={p.key}
              className={`education-stack__seg education-seg--${p.key}`}
              style={{ flexGrow: t[p.key] }}
            />
          ) : null
        )}
      </div>
      <ul className="education-legend" aria-label="Awards by program">
        {shown.map(p => (
          <li key={p.key} className="education-legend__item">
            <span
              className={`education-legend__swatch education-seg--${p.key}`}
              aria-hidden="true"
            />
            <span>{p.label}</span>
            <span className="education-legend__value">{fmt(t[p.key])}</span>
          </li>
        ))}
      </ul>
      {e.legacyByCode.length > 0 && (
        <p className="education-note">
          Legacy awards by code:{' '}
          {e.legacyByCode.map(c => `${c.code} ${fmt(c.count)}`).join(' · ')}
        </p>
      )}
      {e.otherByCode.length > 0 && (
        <p className="education-note">
          Other awards (not a Pathways level, legacy award or DTM):{' '}
          {e.otherByCode
            .map(c => `${c.code || 'blank code'} ${fmt(c.count)}`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

/* ── Level rows / path rows ──────────────────────────────────────────── */

const levelLabel = (key: string) =>
  key === 'DTM' ? 'DTM' : `Level ${key.slice(1)}`

const LevelRows: React.FC<{ e: Available }> = ({ e }) => {
  const [open, setOpen] = useState<string | null>(null)
  const baseId = useId()
  const max = Math.max(1, ...e.levels.map(l => l.count))
  return (
    <ul className="education-rows" aria-label="Awards by level">
      {e.levels.map(l => {
        const chipsId = `${baseId}-${l.key}`
        const expanded = open === l.key
        const hasChips = l.byPath.length > 0
        return (
          <li key={l.key} className="education-row">
            <button
              type="button"
              className="education-row__button"
              aria-expanded={hasChips ? expanded : undefined}
              aria-controls={hasChips ? chipsId : undefined}
              disabled={!hasChips}
              onClick={() => setOpen(expanded ? null : l.key)}
            >
              <span className="education-row__label">{levelLabel(l.key)}</span>
              <span className="education-row__value">{fmt(l.count)}</span>
              <span className="education-row__track" aria-hidden="true">
                <span
                  className={`education-row__bar education-seg--${l.key === 'DTM' ? 'dtm' : 'pathways'}`}
                  style={{ width: `${(l.count / max) * 100}%` }}
                />
              </span>
            </button>
            {hasChips && expanded && (
              <ul
                id={chipsId}
                className="education-chips"
                aria-label={`${levelLabel(l.key)} by path`}
              >
                {l.byPath.map(c => (
                  <li key={c.path} className="education-chip">
                    <abbr title={pathTitle(e.paths, c.path)}>{c.path}</abbr>{' '}
                    <span className="education-chip__value">
                      {fmt(c.count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const pathTitle = (paths: EducationPathRow[], code: string) =>
  paths.find(p => p.path === code)?.title ?? code

const PathRows: React.FC<{ e: Available }> = ({ e }) => {
  const max = Math.max(1, ...e.paths.map(p => p.total))
  return (
    <ul className="education-rows" aria-label="Awards by path">
      {e.paths.map(p => (
        <li key={p.path} className="education-row education-row--path">
          <span className="education-row__label">
            {p.title} <span className="education-row__code">{p.path}</span>
          </span>
          <span className="education-row__value">{fmt(p.total)}</span>
          <span
            className="education-row__track education-row__track--levels"
            aria-hidden="true"
            style={{ width: `${(p.total / max) * 100}%` }}
          >
            {p.levels.map((n, i) =>
              n > 0 ? (
                <span
                  key={i}
                  className={`education-row__levelseg education-level--${i + 1}`}
                  style={{ flexGrow: n }}
                />
              ) : null
            )}
          </span>
          <span className="sr-only">
            {p.levels.map((n, i) => `Level ${i + 1}: ${n}`).join(', ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ── Level × path matrix (Pathways only) ─────────────────────────────── */

const MATRIX_LABEL = 'Level × path, Pathways awards'

const Matrix: React.FC<{ e: Available }> = ({ e }) => {
  const [sel, setSel] = useState<{ path: string; level: number } | null>(null)
  const pathways = e.totals.pathways
  const selPath = sel ? e.paths.find(p => p.path === sel.path) : undefined
  const readout =
    sel && selPath
      ? `${selPath.title} · Level ${sel.level}: ${fmt(selPath.levels[sel.level - 1]!)} awards`
      : 'Tap a cell to read it.'
  // The readout sits OUTSIDE the scroll region, above it, so a tapped cell's
  // value stays in view however far the matrix is scrolled (in the phone
  // sheet the region is the scroller).
  return (
    <>
      <p
        className="education-matrix__readout"
        data-testid="education-matrix-readout"
        aria-live="polite"
      >
        {readout}
      </p>
      <div
        className="education-matrix__region"
        role="region"
        aria-label={MATRIX_LABEL}
        tabIndex={0}
      >
        <table className="education-matrix" aria-label={MATRIX_LABEL}>
          <thead>
            <tr>
              <th scope="col" className="education-matrix__corner">
                Path
              </th>
              {[1, 2, 3, 4, 5].map(l => (
                <th
                  key={l}
                  scope="col"
                  className={sel?.level === l ? 'is-highlighted' : undefined}
                >
                  L{l}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {e.paths.map(p => (
              <tr
                key={p.path}
                className={sel?.path === p.path ? 'is-highlighted' : undefined}
              >
                <th scope="row" className="education-matrix__path">
                  <span className="education-matrix__code">{p.path}</span>
                  <span className="education-matrix__title">{p.title}</span>
                </th>
                {p.levels.map((n, i) => {
                  const active = sel?.path === p.path && sel.level === i + 1
                  return (
                    <td
                      key={i}
                      className={
                        sel?.level === i + 1 ? 'is-highlighted' : undefined
                      }
                    >
                      <button
                        type="button"
                        className="education-matrix__cell"
                        aria-pressed={active}
                        aria-label={`${p.title} level ${i + 1}: ${n}`}
                        onClick={() =>
                          setSel(active ? null : { path: p.path, level: i + 1 })
                        }
                      >
                        {fmt(n)}
                      </button>
                    </td>
                  )
                })}
                <td className="education-matrix__total">{fmt(p.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="education-matrix__path">
                Total
              </th>
              {e.levelTotals.map((n, i) => (
                <td key={i} className="education-matrix__total">
                  {fmt(n)}
                </td>
              ))}
              <td className="education-matrix__total">{fmt(pathways)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

const MatrixSection: React.FC<{ e: Available }> = ({ e }) => {
  const isMobile = useIsMobile(768)
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLButtonElement>(null)
  const sheetId = useId()
  const region = <Matrix e={e} />
  return (
    <section className="education-section" aria-labelledby={`${sheetId}-h`}>
      <h2 id={`${sheetId}-h`} className="education-section__title">
        Level × path
      </h2>
      <p className="education-note">
        Pathways awards only; Legacy awards and DTMs are counted in the totals
        above.
      </p>
      {isMobile ? (
        <>
          <button
            ref={openerRef}
            type="button"
            className="education-open-matrix"
            aria-haspopup="dialog"
            aria-controls={sheetId}
            onClick={() => setOpen(true)}
          >
            Open matrix
          </button>
          <BottomSheet
            id={sheetId}
            isOpen={open}
            onClose={() => setOpen(false)}
            title={MATRIX_LABEL}
            variant="full"
            returnFocusRef={openerRef}
          >
            {region}
          </BottomSheet>
        </>
      ) : (
        region
      )}
    </section>
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

const TH = 'education-rollup__th'

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
  const header = (field: RollupField, text: string, numeric = true) => (
    <SortableHeader<RollupField>
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
          {header('unit', level === 'division' ? 'Division' : 'Area', false)}
          {header('awards', 'Awards')}
          {header('pathways', 'Pathways')}
          {header('dtm', 'DTMs')}
          {header('members', 'Members with an award')}
          {header('clubs', 'Clubs with an award')}
          {header('perBase', 'Awards per base member')}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.key}>
            <th scope="row" className="education-rollup__unit">
              {unitName(r, level)}
            </th>
            <td>{fmt(r.awards)}</td>
            <td>{fmt(r.pathways)}</td>
            <td>{fmt(r.dtm)}</td>
            <td>{members(r)}</td>
            <td>{fmt(r.clubsWithAward)}</td>
            <td>{perBase(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <section
      className="education-section"
      aria-label="Division and area rollup"
    >
      <h2 className="education-section__title">By division and area</h2>
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

export const DistrictEducationView: React.FC<DistrictEducationViewProps> = ({
  education,
  snapshotDate,
  isPriorProgramYear,
}) => {
  const [params] = useSearchParams()
  const href = useParamHref()
  const by: 'level' | 'path' = params.get('by') === 'path' ? 'path' : 'level'

  if (education.status !== 'available') {
    return (
      <div className="education-page">
        <h1 className="education-page__title">Education awards</h1>
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
      <h1 className="education-page__title">Education awards</h1>
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
      <ProgramBar e={e} />

      <section
        className="education-section"
        aria-label="Awards by level or path"
      >
        <h2 className="education-section__title">
          {by === 'level' ? 'By level' : 'By path'}
        </h2>
        <SwitchLinks
          label="Group awards"
          options={[
            {
              label: 'By level',
              href: href('by', null),
              current: by === 'level',
            },
            {
              label: 'By path',
              href: href('by', 'path'),
              current: by === 'path',
            },
          ]}
        />
        {by === 'level' ? <LevelRows e={e} /> : <PathRows e={e} />}
        <p className="education-note">
          Pathways share of all awards:{' '}
          {pct(e.totals.pathways, e.totals.awards)}
        </p>
      </section>

      <MatrixSection e={e} />
      <Rollup e={e} />
    </div>
  )
}

export default DistrictEducationView
