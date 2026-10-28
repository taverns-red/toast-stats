import React, { useId, useState } from 'react'
import type { ProgramYear } from '../utils/programYear'
import { getProgramYear } from '../utils/programYear'
import {
  TARGETS_PARAM,
  TIERED_KPI_GOALS,
  encodeTargets,
  goalsForProgramYear,
  parseTargetInput,
  type SuccessPlanGoalKey,
  type SuccessPlanGoals,
  type SuccessPlanTargets,
} from '../utils/successPlanTargets'

/* District Success Plan targets entry (#2297).

   A leader types the numbers from their District Success Plan; they live
   only in the `?targets=` link (no account, no server, no localStorage), so
   Copy link shares them. The labels are the plan's own goal-area headings
   (TI Item 431, District Strategies Guide, Rev. 05/2025, pp.5–6), each
   mapped to the KPI it is measured by.

   Presentational: the page owns the targets and the program year (R3) and
   writes the URL through `onChange`. A collapsed <details> from first paint,
   so it holds one constant row and never shifts the Overview. */

/* One field per tiered KPI card, in the cards' order (shared list). */
const FIELDS = TIERED_KPI_GOALS.map(g => ({
  key: g.goal,
  label: g.goalArea,
  measure: g.measure,
}))

type Drafts = Record<SuccessPlanGoalKey, string>

const draftsFrom = (goals: SuccessPlanGoals | null): Drafts => ({
  payments: goals?.payments !== undefined ? String(goals.payments) : '',
  paidClubs: goals?.paidClubs !== undefined ? String(goals.paidClubs) : '',
  distinguishedClubs:
    goals?.distinguishedClubs !== undefined
      ? String(goals.distinguishedClubs)
      : '',
})

export interface SuccessPlanTargetsPanelProps {
  /** The program year on screen; targets are bound to it. */
  programYear: ProgramYear
  /** The link's targets, whatever year they are for (null: none). */
  targets: SuccessPlanTargets | null
  onChange: (next: SuccessPlanTargets | null) => void
}

export const SuccessPlanTargetsPanel: React.FC<
  SuccessPlanTargetsPanelProps
> = ({ programYear, targets, onChange }) => {
  const id = useId()
  const goals = goalsForProgramYear(targets, programYear.year)
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(goals))
  const [invalid, setInvalid] = useState<Set<SuccessPlanGoalKey>>(new Set())
  const [notice, setNotice] = useState('')
  // The body mounts only while open: a collapsed panel is one summary row,
  // and its labels do not duplicate the KPI card titles in the page text.
  const [isOpen, setIsOpen] = useState(false)
  const otherYear =
    targets && targets.programYear !== programYear.year
      ? getProgramYear(targets.programYear).label
      : null

  // Re-seed the fields when the link's targets change underneath (back
  // button, a pasted link) — React's derive-from-props pattern.
  const seed = goals
    ? encodeTargets({ programYear: programYear.year, goals })
    : ''
  const [seenSeed, setSeenSeed] = useState(seed)
  if (seed !== seenSeed) {
    setSeenSeed(seed)
    setDrafts(draftsFrom(goals))
    setInvalid(new Set())
  }

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    const next: SuccessPlanGoals = {}
    const bad = new Set<SuccessPlanGoalKey>()
    for (const { key } of FIELDS) {
      const text = drafts[key].trim()
      if (text === '') continue
      const value = parseTargetInput(text)
      if (value === undefined) bad.add(key)
      else next[key] = value
    }
    setInvalid(bad)
    if (bad.size > 0) {
      setNotice('')
      return
    }
    const hasAny = Object.keys(next).length > 0
    onChange(hasAny ? { programYear: programYear.year, goals: next } : null)
    setNotice(hasAny ? 'Targets applied.' : 'Targets cleared.')
  }

  const clear = () => {
    setDrafts(draftsFrom(null))
    setInvalid(new Set())
    onChange(null)
    setNotice('Targets cleared.')
  }

  const copyLink = async () => {
    if (!goals) return
    const url = new URL(window.location.href)
    url.searchParams.set(
      TARGETS_PARAM,
      encodeTargets({ programYear: programYear.year, goals })
    )
    try {
      await navigator.clipboard.writeText(url.toString())
      setNotice('Link copied. Anyone with it sees these targets.')
    } catch {
      setNotice('Copy the address bar to share these targets.')
    }
  }

  const setCount = goals ? Object.keys(goals).length : 0

  return (
    <details
      className="plan-targets"
      data-testid="success-plan-targets"
      open={isOpen}
    >
      {/* Controlled: the summary's click (also fired by Enter/Space) flips
          our state, so the body mounts in the same render. */}
      <summary
        className="plan-targets__summary"
        onClick={e => {
          e.preventDefault()
          setIsOpen(o => !o)
        }}
      >
        <span>Success Plan targets</span>
        {setCount > 0 && (
          <span className="plan-targets__count">{setCount} set</span>
        )}
      </summary>
      {isOpen && (
        <div className="plan-targets__body">
          <p>
            Enter the targets from your District Success Plan for{' '}
            {programYear.label}. They show as a <strong>Plan</strong> mark on
            the cards and as a target line on the Trends payments chart.
          </p>
          <p className="plan-targets__provenance">
            These targets come from this link, not from Toastmasters
            International. Nothing is saved: the link carries them.
          </p>
          {otherYear && (
            <p className="plan-targets__note">
              This link&apos;s targets are for {otherYear}, so they are not
              shown for {programYear.label}.
            </p>
          )}
          <form onSubmit={apply} noValidate>
            <div className="plan-targets__fields">
              {FIELDS.map(f => {
                const inputId = `${id}-${f.key}`
                const hintId = `${inputId}-hint`
                const errorId = `${inputId}-error`
                const isBad = invalid.has(f.key)
                return (
                  <div key={f.key} className="plan-targets__field">
                    <label htmlFor={inputId} className="plan-targets__label">
                      {f.label}
                    </label>
                    <span id={hintId} className="plan-targets__hint">
                      {f.measure}
                    </span>
                    <input
                      id={inputId}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="plan-targets__input"
                      value={drafts[f.key]}
                      onChange={e =>
                        setDrafts(d => ({ ...d, [f.key]: e.target.value }))
                      }
                      aria-invalid={isBad ? 'true' : undefined}
                      aria-describedby={isBad ? `${hintId} ${errorId}` : hintId}
                    />
                    {isBad && (
                      <span id={errorId} className="plan-targets__error">
                        Enter a whole number from 1 to 999,999.
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="plan-targets__actions">
              <button
                type="submit"
                className="plan-targets__btn plan-targets__btn--primary"
              >
                Apply
              </button>
              <button
                type="button"
                className="plan-targets__btn"
                onClick={clear}
              >
                Clear
              </button>
              <button
                type="button"
                className="plan-targets__btn"
                onClick={copyLink}
                disabled={!goals}
              >
                Copy link
              </button>
            </div>
          </form>
          <p role="status" className="plan-targets__status">
            {notice}
          </p>
        </div>
      )}
    </details>
  )
}

export default SuccessPlanTargetsPanel
