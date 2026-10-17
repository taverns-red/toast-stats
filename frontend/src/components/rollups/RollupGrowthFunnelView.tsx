import React from 'react'
import { Link } from 'react-router-dom'
import type { ProspectiveStageCount } from '@taverns-red/shared-contracts'
import { ActionTable, type ActionTableColumn } from '../ActionTable'
import {
  FunnelStrip,
  StageSection,
  type StageId,
  type StageSpec,
} from '../ClubGrowthFunnelView'
import type { MobileRow } from '../MobileRowList'
import type { StageValue } from '../../utils/clubGrowthFunnel'
import type {
  RollupGrowthChild,
  RollupGrowthFunnel,
} from '../../utils/rollupGrowthFunnel'
import { formatDisplayDate } from '../../utils/dateFormatting'

/* RollupGrowthFunnelView (#1812 region, #1813 world) — the district Club
   Growth funnel (#1794) one and two levels up: the same four-stage strip,
   then one section per stage whose table breaks the stage down by the level
   below (a region's districts, the world's regions). Every row links to that
   child's own funnel at the same stage (`…/growth#growth-<stage>`).

   The strip prints each value as text; each section's table is the data
   table behind it. A null figure is "Not available" (N/A), never 0, and
   sorts last. Counts only — the artifacts carry no club or person names. */

export interface RollupGrowthFunnelViewProps {
  funnel: RollupGrowthFunnel
  /** "Region 05" / "worldwide" — used in sentences. */
  scopeLabel: string
  /** "District" (region page) / "Region" (world page). */
  childNoun: 'District' | 'Region'
  /** The page's snapshot date (R3). */
  asOfDate: string
}

const valueText = (v: StageValue) =>
  v.kind === 'count' ? v.value.toLocaleString('en-US') : 'Unknown'

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

function Num({ n }: { n: number | null }) {
  if (n === null) {
    return (
      <span className="rollup-breakdown__na" title="Not available">
        <span aria-hidden="true">N/A</span>
        <span className="sr-only">Not available</span>
      </span>
    )
  }
  return <>{n.toLocaleString('en-US')}</>
}

const numText = (n: number | null) =>
  n === null ? 'not available' : n.toLocaleString('en-US')

/** Highest first; not-available rows last; then by id order (input order). */
function sortBy(
  rows: readonly RollupGrowthChild[],
  read: (r: RollupGrowthChild) => number | null
): RollupGrowthChild[] {
  return rows
    .map((r, i) => ({ r, i, v: read(r) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i
      if (a.v === null) return 1
      if (b.v === null) return -1
      return b.v - a.v || a.i - b.i
    })
    .map(x => x.r)
}

interface ExtraColumn {
  key: string
  header: string
  read: (r: RollupGrowthChild) => number | null
  /** Short phrase for the phone row: "5 payment complete". */
  phrase: string
}

function StageBreakdown({
  stage,
  rows,
  caption,
  childNoun,
  header,
  read,
  extra = [],
}: {
  stage: StageId
  rows: readonly RollupGrowthChild[]
  caption: string
  childNoun: string
  header: string
  read: (r: RollupGrowthChild) => number | null
  extra?: ExtraColumn[]
}) {
  if (rows.length === 0) return null
  const href = (r: RollupGrowthChild) => `${r.to}#growth-${stage}`
  const columns: ActionTableColumn<RollupGrowthChild>[] = [
    {
      key: 'child',
      header: childNoun,
      className: 'action-table__subject growth-table__club',
      cell: r => (
        <Link to={href(r)} className="growth-table__link">
          {r.label}
        </Link>
      ),
    },
    {
      key: 'value',
      header,
      className: 'growth-table__num',
      cell: r => <Num n={read(r)} />,
    },
    ...extra.map(x => ({
      key: x.key,
      header: x.header,
      className: 'growth-table__num',
      cell: (r: RollupGrowthChild) => <Num n={x.read(r)} />,
    })),
  ]
  const mobileRow = (r: RollupGrowthChild): MobileRow => ({
    id: r.id,
    to: href(r),
    title: r.label,
    chip: (
      <span className="district-hub__count">
        {read(r) === null ? 'N/A' : numText(read(r))}
      </span>
    ),
    // The chip carries the stage's count; the one-line meta names it and
    // adds the extras, and the accessible name says all of it in full.
    meta: [
      header.toLowerCase(),
      ...extra.map(x => `${numText(x.read(r))} ${x.phrase}`),
    ].join(' · '),
    ariaLabel: `${r.label}: ${[
      `${header.toLowerCase()} ${numText(read(r))}`,
      ...extra.map(x => `${numText(x.read(r))} ${x.phrase}`),
    ].join(', ')}`,
  })
  return (
    <ActionTable
      caption={caption}
      columns={columns}
      rows={sortBy(rows, read)}
      rowKey={r => r.id}
      mobileRow={mobileRow}
      testId={`rollup-growth-${stage}-table`}
    />
  )
}

const ladderColumns: ActionTableColumn<ProspectiveStageCount>[] = [
  {
    key: 'stage',
    header: 'Stage',
    className: 'growth-table__num',
    cell: g => (g.stage === null ? 'Not recognised' : `Stage ${g.stage}`),
  },
  {
    key: 'label',
    header: 'As reported',
    className: 'action-table__subject rollup-growth__ladder-label',
    cell: g => g.label,
  },
  {
    key: 'clubs',
    header: 'Clubs',
    className: 'growth-table__num',
    cell: g => g.clubs.toLocaleString('en-US'),
  },
]

function StageNote({ value }: { value: StageValue }) {
  if (value.kind === 'count') return null
  return <p className="growth-stage__note">{value.reason}.</p>
}

export const RollupGrowthFunnelView: React.FC<RollupGrowthFunnelViewProps> = ({
  funnel,
  scopeLabel,
  childNoun,
  asOfDate,
}) => {
  const { stages, children } = funnel
  const childPlural = childNoun === 'District' ? 'districts' : 'regions'
  const specs: StageSpec[] = [
    {
      id: 'prospective',
      label: 'Prospective',
      hint: 'clubs being organized',
      value: stages.prospective,
    },
    {
      id: 'chartered',
      label: 'Chartered',
      hint: 'new clubs this program year',
      value: stages.chartered,
    },
    {
      id: 'coached',
      label: 'Coached',
      hint: 'clubs with an active coach',
      value: stages.coached,
    },
    {
      id: 'suspended',
      label: 'Suspended',
      hint: 'clubs suspended this program year',
      value: stages.suspended,
    },
  ]
  const sm = funnel.sponsorsMentors
  const byChild = `by ${childNoun.toLowerCase()}`

  return (
    <div className="growth-page rollup-growth">
      <header className="growth-page__intro">
        <h2 className="growth-page__title">Club Growth</h2>
        <p className="growth-page__subtitle">
          From prospective club to charter, the clubs getting coaching help, and
          the clubs lost this program year, {scopeLabel} — as of{' '}
          {formatDisplayDate(asOfDate)}. Select a stage to see it by{' '}
          {childNoun.toLowerCase()}; select a {childNoun.toLowerCase()} to open
          its own funnel. Counts only — no club or person names.
        </p>
        {funnel.coverage ? (
          <p
            className="growth-stage__note"
            data-testid="rollup-growth-coverage"
          >
            Prospective and coached counts come from the daily reports of{' '}
            {plural(funnel.coverage.districts, 'district', 'districts')}
            {funnel.coverage.withoutReports.length > 0
              ? `; ${plural(
                  funnel.coverage.withoutReports.length,
                  'district has',
                  'districts have'
                )} no reports for this date (District ${funnel.coverage.withoutReports.join(', District ')})`
              : ''}
            .
          </p>
        ) : (
          <p
            className="growth-stage__note"
            data-testid="rollup-growth-reports-note"
          >
            Prospective, coached and sponsor counts are not available yet for
            this date. Chartered and suspended counts come from the club roster.
          </p>
        )}
      </header>

      <FunnelStrip stages={specs} />

      <StageSection
        id="prospective"
        title={`Prospective clubs (${valueText(stages.prospective)})`}
      >
        <StageNote value={stages.prospective} />
        {funnel.paymentComplete !== null && (
          <p className="growth-stage__note">
            {plural(funnel.paymentComplete, 'club has', 'clubs have')} paid the
            charter fee.
          </p>
        )}
        {funnel.prospectiveByStage && funnel.prospectiveByStage.length > 0 && (
          <>
            <h4 className="growth-stage__subtitle">By stage</h4>
            <ActionTable
              caption={`Prospective clubs by stage, ${scopeLabel}`}
              columns={ladderColumns}
              rows={funnel.prospectiveByStage}
              rowKey={g => `${g.stage ?? 'x'}-${g.label}`}
              testId="rollup-growth-ladder-table"
            />
          </>
        )}
        <h4 className="growth-stage__subtitle">By {childNoun.toLowerCase()}</h4>
        <StageBreakdown
          stage="prospective"
          rows={children}
          caption={`Prospective clubs ${byChild}`}
          childNoun={childNoun}
          header="Prospective"
          read={r => r.prospective}
          extra={[
            {
              key: 'paid',
              header: 'Payment complete',
              read: r => r.paymentComplete,
              phrase: 'payment complete',
            },
          ]}
        />
      </StageSection>

      <StageSection
        id="chartered"
        title={`Chartered this program year (${valueText(stages.chartered)})`}
      >
        <StageNote value={stages.chartered} />
        {sm && (
          <p
            className="growth-stage__note"
            data-testid="rollup-growth-sponsors"
          >
            {plural(sm.sponsors, 'sponsor', 'sponsors')} and{' '}
            {plural(sm.mentors, 'mentor', 'mentors')}
            {sm.other > 0
              ? ` (plus ${plural(sm.other, 'other role', 'other roles')})`
              : ''}{' '}
            across {plural(sm.clubs, 'new club', 'new clubs')};{' '}
            {sm.awarded.toLocaleString('en-US')} awarded. Counts only — the
            people are never shown.
          </p>
        )}
        <StageBreakdown
          stage="chartered"
          rows={children}
          caption={`Clubs chartered this program year ${byChild}`}
          childNoun={childNoun}
          header="Chartered"
          read={r => r.chartered}
          extra={[
            {
              key: 'sponsors',
              header: 'Sponsors',
              read: r => r.sponsors,
              phrase: 'sponsors',
            },
            {
              key: 'mentors',
              header: 'Mentors',
              read: r => r.mentors,
              phrase: 'mentors',
            },
          ]}
        />
      </StageSection>

      <StageSection
        id="coached"
        title={`Coached clubs (${valueText(stages.coached)})`}
      >
        <StageNote value={stages.coached} />
        {funnel.coachingCompleted !== null && (
          <p className="growth-stage__note">
            Coaching completed (and no coach active):{' '}
            {plural(funnel.coachingCompleted, 'club', 'clubs')}.
          </p>
        )}
        <StageBreakdown
          stage="coached"
          rows={children}
          caption={`Coached clubs ${byChild}`}
          childNoun={childNoun}
          header="Active coach"
          read={r => r.coached}
          extra={[
            {
              key: 'completed',
              header: 'Coaching completed',
              read: r => r.coachingCompleted,
              phrase: 'completed',
            },
          ]}
        />
      </StageSection>

      <StageSection
        id="suspended"
        title={`Suspended this program year (${valueText(stages.suspended)})`}
      >
        <StageNote value={stages.suspended} />
        <StageBreakdown
          stage="suspended"
          rows={children}
          caption={`Clubs suspended this program year ${byChild}`}
          childNoun={childNoun}
          header="Suspended"
          read={r => r.suspended}
        />
      </StageSection>

      {children.length === 0 && (
        <p className="growth-stage__note">
          No {childPlural} are listed for this date.
        </p>
      )}
    </div>
  )
}

export default RollupGrowthFunnelView
