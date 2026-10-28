/* CouncilPackDocument (#2299) — the printable Area pack (one page) and
 * Division pack (a one-page summary, then the full club roster on page 2).
 *
 * Print-first: one column, tables only, nothing that branches on viewport
 * width (print lays out at the paper's width, not the screen's), and no
 * links inside the document, because print.css prints every href beside its
 * text. Every figure comes from `buildCouncilPack` (no rule here). Contact
 * details and meeting links are never rendered: the roster row type carries
 * none. Styles: styles/components/council-pack.css. */

import React from 'react'
import { Link } from 'react-router-dom'
import type {
  CappedList,
  CouncilPack,
  PackClubRow,
  PackCspMark,
  PackVisitMark,
} from '../../utils/councilPack'
import { formatCloseNeeds } from '../../utils/actionListData'
import {
  CSP_LOST_ELIGIBILITY,
  formatCspDueDate,
} from '../../utils/cspDeadlines'
import { formatDisplayDate } from '../../utils/dateFormatting'
import type { ProgramYear } from '../../utils/programYear'

export interface CouncilPackDocumentProps {
  kind: 'area' | 'division'
  districtId: string
  /** "Area 10" / "Division A". */
  title: string
  /** "Division A" on an area pack; absent on a division pack. */
  parentName?: string | undefined
  pack: CouncilPack
  programYear: ProgramYear
  snapshotDate: string
  asOfDate: string | undefined
  /** The page this pack summarises (printed URL). */
  sourcePath: string
  /** The screen back-link: `sourcePath` with the route's `?py=` / `?date=`. */
  backTo: string
  /** Print time, injected so the date is testable and render-stable. */
  printedAt: Date
}

const SITE = 'ts.taverns.red'

const VISIT_TEXT: Record<PackVisitMark, string> = {
  done: '✓ Done',
  missing: '○ Not yet',
  'not-held': '– n/a',
}
const CSP_TEXT: Record<PackCspMark, string> = {
  submitted: '✓ Filed',
  missing: '○ Not filed',
  'not-held': '– n/a',
}

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function More({ list, what }: { list: CappedList<unknown>; what: string }) {
  if (list.more <= 0) return null
  return (
    <li className="council-pack__more">
      +{list.more} more {what} — see the full list on {SITE}
    </li>
  )
}

function Dates({
  asOf,
  snapshot,
  printed,
  testId,
}: {
  asOf: string
  snapshot: string
  printed: string
  testId?: string
}) {
  return (
    <p className="council-pack__dates" data-testid={testId}>
      <span>Data as of {asOf}</span>
      <span aria-hidden="true"> · </span>
      <span>Snapshot {snapshot}</span>
      <span aria-hidden="true"> · </span>
      <span>Printed {printed}</span>
    </p>
  )
}

function Roster({
  rows,
  showArea,
  round,
  cspTracked,
}: {
  rows: PackClubRow[]
  showArea: boolean
  round: 1 | 2
  cspTracked: boolean
}) {
  if (rows.length === 0) {
    return <p className="council-pack__empty">No clubs are listed here.</p>
  }
  return (
    <table className="council-pack__table" data-testid="council-pack-roster">
      <thead>
        <tr>
          <th scope="col">Club</th>
          {showArea && <th scope="col">Area</th>}
          <th scope="col">Health</th>
          <th scope="col" className="council-pack__num">
            Members
          </th>
          <th scope="col" className="council-pack__num">
            Goals
          </th>
          <th scope="col">Distinguished</th>
          <th scope="col">Round {round} visit</th>
          {cspTracked && <th scope="col">Success Plan</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.clubId}>
            <th scope="row">
              {/* One line with an ellipsis; the full name stays in the DOM. */}
              <span className="council-pack__name" title={r.clubName}>
                {r.clubName}
              </span>
            </th>
            {showArea && <td>{r.areaId}</td>}
            <td>{r.health}</td>
            <td className="council-pack__num">{r.members ?? '—'}</td>
            <td className="council-pack__num">{r.goals ?? '—'}</td>
            <td>{r.distinguished}</td>
            <td>{r.visit ? VISIT_TEXT[r.visit] : '—'}</td>
            {cspTracked && <td>{r.csp ? CSP_TEXT[r.csp] : '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const CouncilPackDocument: React.FC<CouncilPackDocumentProps> = ({
  kind,
  districtId,
  title,
  parentName,
  pack,
  programYear,
  snapshotDate,
  asOfDate,
  sourcePath,
  backTo,
  printedAt,
}) => {
  const asOf = formatDisplayDate(asOfDate ?? snapshotDate)
  const snapshot = formatDisplayDate(snapshotDate)
  const printed = formatDisplayDate(isoLocal(printedAt))
  const deadline = pack.visitDeadline
    ? formatDisplayDate(pack.visitDeadline)
    : undefined
  const rec = pack.recognition
  const isDivision = kind === 'division'
  const eyebrow = [
    `District ${districtId}`,
    parentName,
    `PY ${programYear.label}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const visitsMissing = pack.areas.reduce(
    (n, a) => n + a.missingVisit.length,
    0
  )

  const roster = (
    <section className="council-pack__section" aria-labelledby="cp-roster">
      <h2 id="cp-roster">Clubs ({pack.roster.length})</h2>
      <Roster
        rows={pack.roster}
        showArea={isDivision}
        round={pack.visitRound}
        cspTracked={pack.csp.tracked}
      />
    </section>
  )

  const footer = (
    <footer className="council-pack__footer" data-testid="council-pack-footer">
      <p>
        Source: Toastmasters International district dashboards, via {SITE}. Data
        as of {asOf} · Snapshot {snapshot} · Printed {printed}.
      </p>
      <p>
        {SITE}
        {sourcePath}
      </p>
    </footer>
  )

  return (
    <article
      className={`council-pack council-pack--${kind}`}
      data-testid="council-pack"
      aria-label={`${title} print pack`}
    >
      <div className="council-pack__toolbar council-pack__screen-only">
        <Link to={backTo} className="council-pack__back">
          ← Back to {title}
        </Link>
        <button
          type="button"
          className="council-pack__print"
          onClick={() => window.print()}
        >
          Print
        </button>
        <p className="council-pack__hint">
          {isDivision
            ? 'Prints on two pages of A4 or Letter: the summary, then every club.'
            : 'Prints on one page of A4 or Letter.'}
        </p>
      </div>

      <div className="council-pack__page">
        <header className="council-pack__header">
          <p className="council-pack__eyebrow">{eyebrow}</p>
          <h1 className="council-pack__title">{title}</h1>
          <Dates
            asOf={asOf}
            snapshot={snapshot}
            printed={printed}
            testId="council-pack-dates"
          />
        </header>

        <section className="council-pack__section" aria-labelledby="cp-rec">
          <h2 id="cp-rec">Recognition</h2>
          <dl className="council-pack__facts">
            <div>
              <dt>Status</dt>
              <dd>{rec.label}</dd>
            </div>
            <div>
              <dt>Paid clubs</dt>
              <dd>
                {rec.paidClubs} of {rec.clubBase} base
              </dd>
            </div>
            <div>
              <dt>Distinguished clubs</dt>
              <dd>
                {rec.distinguishedClubs} (Distinguished needs{' '}
                {rec.requiredDistinguishedClubs})
              </dd>
            </div>
            <div>
              <dt>Gap to D / S / P</dt>
              <dd>
                {rec.gapToDistinguished} / {rec.gapToSelect} /{' '}
                {rec.gapToPresidents}
              </dd>
            </div>
          </dl>
          {isDivision && (
            <table
              className="council-pack__table"
              data-testid="council-pack-areas"
            >
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="council-pack__num">
                    Paid / base
                  </th>
                  <th scope="col" className="council-pack__num">
                    Distinguished
                  </th>
                  <th scope="col" className="council-pack__num">
                    Round {pack.visitRound} visits
                  </th>
                  {pack.csp.tracked && (
                    <th scope="col" className="council-pack__num">
                      Success Plans
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pack.areas.map(a => (
                  <tr key={a.areaId} data-area-id={a.areaId}>
                    <th scope="row">{a.areaId}</th>
                    <td>{a.recognition}</td>
                    <td className="council-pack__num">
                      {a.paidClubs}/{a.clubBase}
                    </td>
                    <td className="council-pack__num">
                      {a.distinguishedClubs}/{a.requiredDistinguishedClubs}
                    </td>
                    <td className="council-pack__num">
                      {a.visits.completed}/{a.visits.required}{' '}
                      {a.visits.meetsThreshold ? '✓' : '✗'}
                    </td>
                    {pack.csp.tracked && (
                      <td className="council-pack__num">
                        {a.cspSubmitted}/{a.cspHeld}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="council-pack__section" aria-labelledby="cp-close">
          <h2 id="cp-close">
            Close to Distinguished ({pack.closeToDistinguished.total})
          </h2>
          {pack.closeToDistinguished.total === 0 ? (
            <p className="council-pack__empty">
              No club is within reach of Distinguished yet (3+ DCP goals, within
              3 members, Success Plan filed).
            </p>
          ) : (
            <ul className="council-pack__list">
              {pack.closeToDistinguished.shown.map(c => (
                <li key={c.clubId}>
                  <span className="council-pack__club">{c.clubName}</span>
                  {isDivision && ` (Area ${c.areaId})`} — needs{' '}
                  {formatCloseNeeds(c)}
                </li>
              ))}
              <More list={pack.closeToDistinguished} what="clubs" />
            </ul>
          )}
        </section>

        <section className="council-pack__section" aria-labelledby="cp-visits">
          <h2 id="cp-visits">
            Club visits — round {pack.visitRound}
            {deadline ? `, due ${deadline}` : ''}
          </h2>
          {isDivision ? (
            <p>
              {visitsMissing === 0
                ? 'Every active club has its visit for this round.'
                : `${plural(visitsMissing, 'active club')} still to visit: ${pack.areas
                    .filter(a => a.missingVisit.length > 0)
                    .map(a => `Area ${a.areaId} ${a.missingVisit.length}`)
                    .join(', ')}. Each club's visit is on page 2.`}
            </p>
          ) : (
            pack.areas.map(a => (
              <p key={a.areaId}>
                {a.visits.completed} of {a.clubBase} clubs visited (
                {a.visits.required} needed){' '}
                {a.visits.meetsThreshold ? '✓' : '✗'}.
                {a.missingVisit.length > 0 &&
                  ` Still to visit: ${a.missingVisit.map(c => c.clubName).join(', ')}.`}
              </p>
            ))
          )}
        </section>

        <section className="council-pack__section" aria-labelledby="cp-csp">
          <h2 id="cp-csp">Club Success Plans</h2>
          {!pack.csp.tracked ? (
            <p className="council-pack__empty">
              Club Success Plans are not tracked for PY {programYear.label}.
            </p>
          ) : (
            <>
              <p>
                {pack.csp.submitted} of {pack.csp.held} clubs filed.
              </p>
              {pack.csp.missing.total > 0 && (
                <ul className="council-pack__list">
                  {pack.csp.missing.shown.map(c => (
                    <li key={c.clubNumber}>
                      <span className="council-pack__club">{c.clubName}</span>
                      {isDivision && ` (Area ${c.areaId})`} —{' '}
                      {c.cspOverdue
                        ? `not filed by ${formatCspDueDate(c.cspDueDate)}; ${CSP_LOST_ELIGIBILITY}`
                        : `due ${formatCspDueDate(c.cspDueDate)}`}
                    </li>
                  ))}
                  <More list={pack.csp.missing} what="clubs" />
                </ul>
              )}
            </>
          )}
        </section>

        {!isDivision && roster}
        {!isDivision && footer}
        {isDivision && (
          <p className="council-pack__continued">
            Page 2: every club in {title}.
          </p>
        )}
      </div>

      {isDivision && (
        <div className="council-pack__page council-pack__roster--own-page">
          <header className="council-pack__header council-pack__header--compact">
            <p className="council-pack__eyebrow">{eyebrow}</p>
            <p className="council-pack__title council-pack__title--small">
              {title} — clubs
            </p>
          </header>
          {roster}
          {footer}
        </div>
      )}
    </article>
  )
}
