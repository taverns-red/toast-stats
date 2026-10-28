import React from 'react'
import { Link } from 'react-router-dom'
import type {
  ChecklistStep,
  ProspectiveClubPageModel,
} from '../utils/prospectiveClubPage'
import { formatDisplayDate } from '../utils/dateFormatting'

/* #2303 — one prospective club, in-site: the header (club, division/area,
   Find-a-Club place), TI's charter checklist and the links on.

   The checklist is an ordered list of text rows — status, the date TI last
   changed the step, days since — and never a progress bar: the steps are
   completed out of order and can go back to Incomplete, so nothing here
   implies a sequence. Sponsors and mentors are not counted: TI reports them
   only once a club charters. Privacy: the model carries no report location,
   website or meeting time, so this view cannot render one. */

export interface ProspectiveClubViewProps {
  model: ProspectiveClubPageModel
  districtId: string
  /** The displayed snapshot date (R3). */
  asOfDate: string
  /** `?py=&date=` kept from the page URL, or ''. */
  growthQuery: string
}

const statusText: Record<ChecklistStep['status'], string> = {
  complete: 'Complete',
  incomplete: 'Incomplete',
  'not-listed': 'Not listed',
}

function divisionArea(division: string, area: string): string {
  if (!division && !area) return 'Not yet assigned'
  return `${division || '—'} / ${area || '—'}`
}

function days(n: number): string {
  if (n === 0) return 'today'
  return `${n} ${n === 1 ? 'day' : 'days'} ago`
}

function StepRow({ step }: { step: ChecklistStep }) {
  const name =
    step.number === null ? step.label : `#${step.number} ${step.label}`
  return (
    <li className="prospective-checklist__step">
      <span className="prospective-checklist__name">{name}</span>
      <span
        className={`prospective-checklist__status prospective-checklist__status--${step.status}`}
      >
        {statusText[step.status]}
      </span>
      <span className="prospective-checklist__when">
        {step.date
          ? `Last changed ${formatDisplayDate(step.date)}${
              step.daysSince !== null ? ` · ${days(step.daysSince)}` : ''
            }`
          : step.status === 'not-listed'
            ? 'Not in TI’s report yet'
            : 'No date given'}
      </span>
    </li>
  )
}

export const ProspectiveClubView: React.FC<ProspectiveClubViewProps> = ({
  model,
  districtId,
  asOfDate,
  growthQuery,
}) => {
  const backHref = `/district/${districtId}/growth${growthQuery}#growth-prospective`
  const back = (
    <Link to={backHref} className="growth-table__link">
      ← Back to prospective clubs
    </Link>
  )
  const displayDate = formatDisplayDate(asOfDate)

  if (model.kind === 'unknown') {
    return (
      <section className="growth-page prospective-club">
        <p className="growth-stage__note" role="status">
          TI&rsquo;s Prospective Clubs report is not available for this date (
          {displayDate}). Try another date.
        </p>
        <p>{back}</p>
      </section>
    )
  }

  const tiLink = model.tiHref ? (
    <a
      href={model.tiHref}
      className="growth-table__link"
      target="_blank"
      rel="noopener noreferrer"
    >
      View on toastmasters.org
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : null

  if (model.kind === 'not-found') {
    return (
      <section className="growth-page prospective-club">
        <p className="growth-stage__note" role="status">
          Club {model.clubId} is not a prospective club on {displayDate}.
          {model.clubHref ? ' It is in this district’s club list.' : ''}
        </p>
        <ul className="prospective-club__links">
          {model.clubHref ? (
            <li>
              <Link to={model.clubHref} className="growth-table__link">
                Go to its club page
              </Link>
            </li>
          ) : null}
          <li>{back}</li>
          {tiLink ? <li>{tiLink}</li> : null}
        </ul>
      </section>
    )
  }

  return (
    <section
      className="growth-page prospective-club"
      aria-labelledby="prospective-club-heading"
    >
      <p className="prospective-club__eyebrow">Prospective club</p>
      <h2 id="prospective-club-heading" className="growth-page__title">
        {model.clubName}
      </h2>
      <dl className="prospective-club__facts">
        <div>
          <dt>Division / Area</dt>
          <dd>{divisionArea(model.division, model.area)}</dd>
        </div>
        <div>
          <dt>Place</dt>
          <dd>{model.place ?? 'Not listed on Find a Club yet'}</dd>
        </div>
        <div>
          <dt>Club number</dt>
          <dd>{model.clubId}</dd>
        </div>
      </dl>

      <h3 id="prospective-checklist-heading" className="growth-stage__title">
        Charter checklist
      </h3>
      <p className="growth-stage__note">
        From TI&rsquo;s Prospective Clubs report
        {model.reportAsOf ? `, as of ${model.reportAsOf}` : ''}. Days are
        counted to {displayDate}. Each date is when TI last changed the step, so
        a step can move from Complete back to Incomplete, and steps are not
        always done in order.
      </p>
      {model.checklist ? (
        <ol
          className="prospective-checklist"
          aria-labelledby="prospective-checklist-heading"
        >
          {model.checklist.map(s => (
            <StepRow key={s.key} step={s} />
          ))}
        </ol>
      ) : (
        <p className="growth-stage__note">
          TI&rsquo;s status text: {model.rawProspect || 'Not stated'}
        </p>
      )}

      <h3 className="growth-stage__title prospective-club__section">
        Sponsors and mentors
      </h3>
      <p className="growth-stage__note">
        TI doesn&rsquo;t report sponsors or mentors until a club charters. Once
        this club charters, its counts appear under Club Growth.
      </p>

      <ul className="prospective-club__links">
        <li>{back}</li>
        {tiLink ? <li>{tiLink}</li> : null}
      </ul>
    </section>
  )
}
