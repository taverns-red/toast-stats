import React from 'react'
import { Link } from 'react-router-dom'
import type {
  CharteredRow,
  ClubGrowthFunnel,
  CoachedRow,
  ProspectiveRow,
  StageValue,
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

type StageId = 'prospective' | 'chartered' | 'coached' | 'suspended'

interface StageSpec {
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

function FunnelStrip({ stages }: { stages: StageSpec[] }) {
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

function StageSection({
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

const paymentText: Record<ProspectiveRow['payment'], string> = {
  complete: 'Payment complete',
  incomplete: 'Payment incomplete',
  unknown: 'Payment not stated',
}

const prospectiveColumns: ActionTableColumn<ProspectiveRow>[] = [
  {
    key: 'club',
    header: 'Club',
    className: 'growth-table__club',
    cell: r =>
      r.href ? (
        <a
          href={r.href}
          className="growth-table__link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {r.clubName}
          <span className="sr-only"> (opens toastmasters.org)</span>
        </a>
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
    className: 'growth-table__club',
    cell: r => (
      <Link to={r.href} className="growth-table__link">
        {r.clubName}
      </Link>
    ),
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
    className: 'growth-table__club',
    cell: r => (
      <Link to={r.href} className="growth-table__link">
        {r.clubName}
      </Link>
    ),
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

export const ClubGrowthFunnelView: React.FC<ClubGrowthFunnelViewProps> = ({
  funnel,
  asOfDate,
}) => {
  const { prospective, chartered, coached, suspended } = funnel
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
        <p className="growth-stage__note">
          {suspended.value.kind === 'unknown'
            ? `${suspended.value.reason}. `
            : ''}
          This site receives the count only, so the suspended clubs cannot be
          listed here yet.
        </p>
      </StageSection>
    </div>
  )
}

export default ClubGrowthFunnelView
