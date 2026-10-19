import React, { useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  EducationPathRow,
  EducationSummary,
} from '../../utils/districtEducation'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useParamHref } from '../../hooks/useParamHref'
import { BottomSheet } from '../BottomSheet'

/* The education breakdown shared by `/district/:id/education` (#1793) and
   `/region/:n/education` (#1810): the all-awards bar (Pathways, Legacy, DTM
   and Other stacked), level rows or path rows (`?by=path`, URL state), and
   the Pathways-only level × path matrix. Every figure is printed; bars are
   aria-hidden decoration. */

const fmt = (n: number) => n.toLocaleString()
const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0%'

export const SwitchLinks: React.FC<{
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

/* ── All awards by program ───────────────────────────────────────────── */

const PROGRAMS = [
  { key: 'pathways', label: 'Pathways' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'dtm', label: 'DTM' },
  { key: 'other', label: 'Other' },
] as const

export const ProgramBar: React.FC<{ e: EducationSummary }> = ({ e }) => {
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

const LevelRows: React.FC<{ e: EducationSummary }> = ({ e }) => {
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

const PathRows: React.FC<{ e: EducationSummary }> = ({ e }) => {
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

const Matrix: React.FC<{ e: EducationSummary }> = ({ e }) => {
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

export const MatrixSection: React.FC<{ e: EducationSummary }> = ({ e }) => {
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

/* ── By level / by path (`?by=path`) ─────────────────────────────────── */

export const ByLevelOrPathSection: React.FC<{ e: EducationSummary }> = ({
  e,
}) => {
  const [params] = useSearchParams()
  const href = useParamHref()
  const by: 'level' | 'path' = params.get('by') === 'path' ? 'path' : 'level'
  return (
    <section className="education-section" aria-label="Awards by level or path">
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
        Pathways share of all awards: {pct(e.totals.pathways, e.totals.awards)}
      </p>
    </section>
  )
}
