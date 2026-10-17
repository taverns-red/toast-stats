import React from 'react'
import { Link } from 'react-router-dom'
import type {
  CharteredRow,
  ClubGrowthFunnel,
  CoachedRow,
  ProspectiveRow,
  SponsorMentorClubRow,
  StageValue,
  SuspendedRow,
} from '../utils/clubGrowthFunnel'
import { formatDisplayDate } from '../utils/dateFormatting'
import { ActionTable, type ActionTableColumn } from './ActionTable'
import type { MobileRow } from './MobileRowList'

/* #1794 — the district Club Growth funnel: Prospective → Chartered this
   program year → Coached → Suspended this program year.

   One page, no tabs (ADR-005): the funnel strip is an ordered list whose
   stages are in-page links to each stage's section (`#growth-<stage>`), so a
   stage is deep-linkable and the back button works. Every value is printed as
   text; the bar beside it is decorative (aria-hidden). An unknown stage says
   "Unknown" and why, never 0 (#1757). Privacy: club ids, names, dates and
   statuses only — no person, email or phone ever reaches this view. */

export type StageId = 'prospective' | 'chartered' | 'coached' | 'suspended'

/* The strip and the stage sections are shared with the region and world
   funnels (#1812, #1813), so the three levels read alike. */
export interface StageSpec {
  id: StageId
  label: string
  hint: string
  value: StageValue
}

export interface ClubGrowthFunnelViewProps {
  funnel: ClubGrowthFunnel
  /** The displayed snapshot date (R3). */
  asOfDate: string
}

const sectionId = (id: StageId) => `growth-${id}`

function valueText(v: StageValue): string {
  return v.kind === 'count' ? String(v.value) : 'Unknown'
}

function divisionArea(division: string, area: string): string {
  if (!division && !area) return 'Not yet assigned'
  return `${division || '—'} / ${area || '—'}`
}

export function FunnelStrip({ stages }: { stages: StageSpec[] }) {
  const max = Math.max(
    1,
    ...stages.map(s => (s.value.kind === 'count' ? s.value.value : 0))
  )
  return (
    <ol className="growth-funnel" aria-label="Club Growth funnel">
      {stages.map((s, i) => {
        const pct =
          s.value.kind === 'count' && s.value.value > 0
            ? Math.max(4, Math.round((s.value.value / max) * 100))
            : 0
        return (
          <li
            key={s.id}
            className="growth-funnel__stage"
            data-testid={`growth-stage-${s.id}`}
          >
            <a href={`#${sectionId(s.id)}`} className="growth-funnel__link">
              <span className="growth-funnel__step" aria-hidden="true">
                {i + 1}
              </span>
              <span className="growth-funnel__text">
                <span className="growth-funnel__label">{s.label}</span>
                <span
                  className={
                    s.value.kind === 'count'
                      ? 'growth-funnel__value'
                      : 'growth-funnel__value growth-funnel__value--unknown'
                  }
                >
                  {valueText(s.value)}
                </span>
                <span className="growth-funnel__hint">
                  {s.value.kind === 'unknown' ? s.value.reason : s.hint}
                </span>
              </span>
              <span className="growth-funnel__track" aria-hidden="true">
                <span
                  className="growth-funnel__bar"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}

export function StageSection({
  id,
  title,
  children,
}: {
  id: StageId
  title: string
  children: React.ReactNode
}) {
  const headingId = `${sectionId(id)}-heading`
  return (
    <section
      id={sectionId(id)}
      className="growth-stage"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="growth-stage__title">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A club name linking to its page here, or — `external` — to its page on
 *  toastmasters.org in a new tab (said to screen readers). */
function ClubLink({
  name,
  href,
  external = false,
}: {
  name: string
  href: string
  external?: boolean
}) {
  if (!external) {
    return (
      <Link to={href} className="growth-table__link">
        {name}
      </Link>
    )
  }
  return (
    <a
      href={href}
      className="growth-table__link"
      target="_blank"
      rel="noopener noreferrer"
    >
      {name}
      <span className="sr-only"> (opens toastmasters.org)</span>
    </a>
  )
}

const paymentText: Record<ProspectiveRow['payment'], string> = {
  complete: 'Complete',
  incomplete: 'Incomplete',
  unknown: 'Not stated',
}

const prospectiveColumns: ActionTableColumn<ProspectiveRow>[] = [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: r =>
      r.href ? (
        <ClubLink name={r.clubName} href={r.href} external />
      ) : (
        r.clubName
      ),
  },
  {
    key: 'where',
    header: 'Division / Area',
    cell: r => divisionArea(r.division, r.area),
  },
  {
    key: 'stage',
    header: 'Stage',
    cell: r =>
      r.stage.recognised
        ? `${r.stage.stageNumber} · ${r.stage.stageLabel}`
        : r.stage.raw || 'Not stated',
  },
  {
    key: 'days',
    header: 'Days in stage',
    className: 'growth-table__num',
    cell: r =>
      r.daysInStage === null
        ? '—'
        : `${r.daysInStage} ${r.daysInStage === 1 ? 'day' : 'days'}`,
  },
  { key: 'payment', header: 'Payment', cell: r => paymentText[r.payment] },
]

const charteredColumns: ActionTableColumn<CharteredRow>[] = [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: r => <ClubLink name={r.clubName} href={r.href} />,
  },
  {
    key: 'where',
    header: 'Division / Area',
    cell: r => divisionArea(r.division, r.area),
  },
  {
    key: 'chartered',
    header: 'Chartered',
    cell: r => formatDisplayDate(r.charterDate),
  },
]

const charteredMobileRow = (r: CharteredRow): MobileRow => ({
  id: r.clubId,
  to: r.href,
  title: r.clubName,
  meta: `Chartered ${formatDisplayDate(r.charterDate)} · ${divisionArea(r.division, r.area)}`,
})

const coachStatusText = (r: CoachedRow) =>
  r.status === 'active' ? 'Active coach' : 'Coaching completed'

const coachedColumns: ActionTableColumn<CoachedRow>[] = [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: r => <ClubLink name={r.clubName} href={r.href} />,
  },
  { key: 'status', header: 'Status', cell: coachStatusText },
  {
    key: 'since',
    header: 'Since',
    cell: r => (r.since ? formatDisplayDate(r.since) : '—'),
  },
]

const coachedMobileRow = (r: CoachedRow): MobileRow => ({
  id: r.clubId,
  to: r.href,
  title: r.clubName,
  meta: `${coachStatusText(r)}${r.since ? ` · since ${formatDisplayDate(r.since)}` : ''}`,
})

const suspendedColumns: ActionTableColumn<SuspendedRow>[] = [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: r => (
      <ClubLink name={r.clubName} href={r.href} external={r.external} />
    ),
  },
  {
    key: 'where',
    header: 'Division / Area',
    cell: r => divisionArea(r.division, r.area),
  },
  {
    key: 'suspended',
    header: 'Suspended',
    cell: r => formatDisplayDate(r.suspendDate),
  },
]

const suspendedMobileRow = (r: SuspendedRow): MobileRow => ({
  id: r.clubId,
  to: r.href,
  external: r.external,
  title: r.clubName,
  meta: `Suspended ${formatDisplayDate(r.suspendDate)} · ${divisionArea(r.division, r.area)}`,
  ...(r.external
    ? {
        ariaLabel: `${r.clubName}, suspended ${formatDisplayDate(r.suspendDate)} (opens toastmasters.org)`,
      }
    : {}),
})

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

const sponsorColumns = (
  showOther: boolean
): ActionTableColumn<SponsorMentorClubRow>[] => [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject growth-table__club',
    cell: r => (
      <ClubLink name={r.clubName} href={r.href} external={r.external} />
    ),
  },
  {
    key: 'chartered',
    header: 'Chartered',
    cell: r => (r.charterDate ? formatDisplayDate(r.charterDate) : '—'),
  },
  {
    key: 'sponsors',
    header: 'Sponsors',
    className: 'growth-table__num',
    cell: r => r.sponsors,
  },
  {
    key: 'mentors',
    header: 'Mentors',
    className: 'growth-table__num',
    cell: r => r.mentors,
  },
  ...(showOther
    ? [
        {
          key: 'other',
          header: 'Other roles',
          className: 'growth-table__num',
          cell: (r: SponsorMentorClubRow) => r.other,
        },
      ]
    : []),
  {
    key: 'awarded',
    header: 'Awarded',
    className: 'growth-table__num',
    cell: r => r.awarded,
  },
]

const sponsorRoleParts = (r: SponsorMentorClubRow) => [
  plural(r.sponsors, 'sponsor', 'sponsors'),
  plural(r.mentors, 'mentor', 'mentors'),
  ...(r.other > 0 ? [plural(r.other, 'other role', 'other roles')] : []),
]

/* The row primitive's meta line is one ellipsizing line (56–64 px row
   contract, #1833), so the row's accessible name always carries the full
   counts — a clipped meta never hides a number from a screen reader. */
const sponsorMobileRow = (r: SponsorMentorClubRow): MobileRow => ({
  id: r.clubId,
  to: r.href,
  external: r.external,
  title: r.clubName,
  meta: [
    ...sponsorRoleParts(r),
    ...(r.awarded > 0 ? [`${r.awarded} awarded`] : []),
  ].join(' · '),
  ariaLabel: `${r.clubName}, chartered ${
    r.charterDate ? formatDisplayDate(r.charterDate) : 'date not stated'
  }: ${[...sponsorRoleParts(r), `${r.awarded} awarded`].join(', ')}${
    r.external ? ' (opens toastmasters.org)' : ''
  }`,
})

/** Sponsor/mentor COUNTS for new clubs (#1795) — who sponsors or mentors a
 *  club is never shown. Absent section = the report is not available yet. */
function SponsorsMentors({
  data,
}: {
  data: ClubGrowthFunnel['sponsorsMentors']
}) {
  return (
    <div data-testid="growth-sponsors">
      <h4 className="growth-stage__subtitle">Sponsors and mentors</h4>
      {data === null ? (
        <p className="growth-stage__note">
          Sponsor and mentor counts are not available yet for this date.
        </p>
      ) : data.clubs.length === 0 ? (
        <p className="growth-stage__note">
          No sponsor or mentor assignments reported for new clubs.
        </p>
      ) : (
        <>
          <p className="growth-stage__note">
            {plural(data.totals.sponsors, 'sponsor', 'sponsors')} and{' '}
            {plural(data.totals.mentors, 'mentor', 'mentors')}
            {data.totals.other > 0
              ? ` (plus ${plural(data.totals.other, 'other role', 'other roles')})`
              : ''}{' '}
            across {plural(data.totals.clubs, 'new club', 'new clubs')};{' '}
            {data.totals.awarded} awarded. Counts only — the people are never
            shown.
          </p>
          <ActionTable
            caption="Sponsor and mentor counts by new club"
            columns={sponsorColumns(data.totals.other > 0)}
            rows={data.clubs}
            rowKey={r => r.clubId}
            mobileRow={sponsorMobileRow}
            testId="growth-sponsors-table"
          />
        </>
      )}
    </div>
  )
}

export const ClubGrowthFunnelView: React.FC<ClubGrowthFunnelViewProps> = ({
  funnel,
  asOfDate,
}) => {
  const { prospective, chartered, coached, suspended, sponsorsMentors } = funnel
  const stages: StageSpec[] = [
    {
      id: 'prospective',
      label: 'Prospective',
      hint: 'clubs being organized',
      value: prospective.value,
    },
    {
      id: 'chartered',
      label: 'Chartered',
      hint: 'new clubs this program year',
      value: chartered.value,
    },
    {
      id: 'coached',
      label: 'Coached',
      hint: 'clubs with an active coach',
      value: coached.value,
    },
    {
      id: 'suspended',
      label: 'Suspended',
      hint: 'clubs suspended this program year',
      value: suspended.value,
    },
  ]

  return (
    <div className="growth-page">
      <header className="growth-page__intro">
        <h2 className="growth-page__title">Club Growth</h2>
        <p className="growth-page__subtitle">
          From prospective club to charter, the clubs getting coaching help, and
          the clubs lost this program year — as of {formatDisplayDate(asOfDate)}
          . Select a stage to see its clubs.
        </p>
      </header>

      <FunnelStrip stages={stages} />

      <StageSection
        id="prospective"
        title={`Prospective clubs (${valueText(prospective.value)})`}
      >
        {prospective.value.kind === 'unknown' ? (
          <p className="growth-stage__note">{prospective.value.reason}.</p>
        ) : prospective.clubs.length === 0 ? (
          <p className="growth-stage__note">
            No prospective clubs in this district right now.
          </p>
        ) : (
          <>
            <p className="growth-stage__note">
              {prospective.byStage
                .map(
                  g =>
                    `${g.stageNumber !== null ? `Stage ${g.stageNumber} · ` : ''}${g.stageLabel}: ${g.count}`
                )
                .join(' · ')}
              . Longest-waiting first. Prospective clubs have no page here yet,
              so each links to its page on toastmasters.org.
            </p>
            <ActionTable
              caption="Prospective clubs"
              columns={prospectiveColumns}
              rows={prospective.clubs}
              rowKey={r => r.clubId}
              testId="growth-prospective-table"
            />
          </>
        )}
      </StageSection>

      <StageSection
        id="chartered"
        title={`Chartered this program year (${valueText(chartered.value)})`}
      >
        {chartered.clubs.length > 0 ? (
          <ActionTable
            caption="Clubs chartered this program year"
            columns={charteredColumns}
            rows={chartered.clubs}
            rowKey={r => r.clubId}
            mobileRow={charteredMobileRow}
            testId="growth-chartered-table"
          />
        ) : chartered.value.kind === 'unknown' ? (
          <p className="growth-stage__note">{chartered.value.reason}.</p>
        ) : chartered.value.value === 0 ? (
          <p className="growth-stage__note">
            No new clubs chartered in this program year yet.
          </p>
        ) : (
          <p className="growth-stage__note">
            Toastmasters International counts {chartered.value.value} new{' '}
            {chartered.value.value === 1 ? 'club' : 'clubs'} this program year,
            but this date’s new-club report does not list them.
          </p>
        )}
        <SponsorsMentors data={sponsorsMentors} />
      </StageSection>

      <StageSection
        id="coached"
        title={`Coached clubs (${valueText(coached.value)})`}
      >
        {coached.value.kind === 'unknown' ? (
          <p className="growth-stage__note">{coached.value.reason}.</p>
        ) : (
          <>
            {coached.active.length === 0 ? (
              <p className="growth-stage__note">
                No club has an active coach right now.
              </p>
            ) : (
              <ActionTable
                caption="Clubs with an active coach"
                columns={coachedColumns}
                rows={coached.active}
                rowKey={r => r.clubId}
                mobileRow={coachedMobileRow}
                testId="growth-coached-table"
              />
            )}
            {coached.completed.length > 0 && (
              <>
                <h4 className="growth-stage__subtitle">
                  Coaching completed ({coached.completed.length})
                </h4>
                <ActionTable
                  caption="Clubs whose coaching is completed"
                  columns={coachedColumns}
                  rows={coached.completed}
                  rowKey={r => r.clubId}
                  mobileRow={coachedMobileRow}
                  testId="growth-coached-completed-table"
                />
              </>
            )}
          </>
        )}
      </StageSection>

      <StageSection
        id="suspended"
        title={`Suspended this program year (${valueText(suspended.value)})`}
      >
        {suspended.clubs === null ? (
          <p className="growth-stage__note">
            {suspended.value.kind === 'unknown'
              ? `${suspended.value.reason}. `
              : ''}
            The list of suspended clubs is not available for this date yet —
            only the count.
          </p>
        ) : suspended.clubs.length === 0 ? (
          <p className="growth-stage__note">
            No clubs suspended in this program year.
          </p>
        ) : (
          <>
            <p className="growth-stage__note">
              Most recent first. A club without a page here links to its page on
              toastmasters.org.
            </p>
            <ActionTable
              caption="Clubs suspended this program year"
              columns={suspendedColumns}
              rows={suspended.clubs}
              rowKey={r => r.clubId}
              mobileRow={suspendedMobileRow}
              testId="growth-suspended-table"
            />
          </>
        )}
      </StageSection>
    </div>
  )
}

export default ClubGrowthFunnelView
