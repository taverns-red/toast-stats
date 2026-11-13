import React from 'react'
import InfoTooltip from './InfoTooltip'
import { AreaPerformance } from '../utils/divisionStatus'
import {
  calculateAreaGapAnalysis,
  calculatePaidClubsPercentage,
  calculateDistinguishedPercentage,
} from '../utils/areaGapAnalysis'
import { renderRecognitionBadge } from '../utils/areaRecognitionBadge'
import { CriterionCell } from './dataTable/cells/CriterionCell'
import { StaticTableScroll } from './dataTable/StaticTableScroll'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'

/**
 * Props for the AreaPerformanceTable component
 */
interface AreaPerformanceTableProps {
  /** Array of area performance data to display */
  areas: AreaPerformance[]
  /** Accessible name of the scroll region. Must be unique per page when
   *  several tables render (axe landmark-unique), e.g. one per division. */
  label?: string
}

/**
 * Format gap display - shows the number of additional distinguished clubs needed
 * Returns "-" if level is already achieved, "N/A" if not achievable
 *
 * Requirements: 9.6
 */
const formatGap = (
  distinguishedClubsNeeded: number,
  achieved: boolean,
  achievable: boolean
): string => {
  if (achieved) {
    return '-'
  }
  if (!achievable) {
    return 'N/A'
  }
  return `+${distinguishedClubsNeeded}`
}

/* Phone recognition chip (#1834): a phone metric column holds ~80px, so
   "President's Distinguished (Provisional)" can't fit (Lesson 134). The
   chip shows a short label; the full one is tooltip + screen-reader text. */
const shortBadgeLabel = (label: string): string =>
  label
    .replace("President's Distinguished", 'Pres.')
    .replace('Select Distinguished', 'Select')
    .replace('Not Distinguished', 'Not dist.')
    .replace(/^Distinguished/, 'Dist.')
    .replace('(Provisional)', '(prov.)')

const gapCell = (gap: {
  distinguishedClubsNeeded: number
  achieved: boolean
  achievable: boolean
}) => formatGap(gap.distinguishedClubsNeeded, gap.achieved, gap.achievable)

/** Visits completed of required, then marker plus "Met" / "Not met" (#2718):
 *  the outcome never rests on colour or a tick/cross glyph. */
const visitCell = (v: AreaPerformance['firstRoundVisits']) => (
  <CriterionCell met={v.meetsThreshold}>
    {v.completed}/{v.required}
  </CriterionCell>
)

const PHONE_METRICS: PriorityMetric<AreaPerformance, never>[] = [
  {
    id: 'paid',
    label: 'Paid',
    title: 'Paid clubs / club base (≥ club base required)',
    render: a => (
      <>
        <span className="block">
          {a.paidClubs}/{a.clubBase}
        </span>
        <span className="block">
          {calculatePaidClubsPercentage(a.clubBase, a.paidClubs)}%
        </span>
      </>
    ),
  },
  {
    id: 'dist',
    label: 'Dist.',
    title: 'Distinguished clubs / club base',
    render: a => (
      <>
        <span className="block">
          {a.distinguishedClubs}/{a.clubBase}
        </span>
        <span className="block">
          {calculateDistinguishedPercentage(a.clubBase, a.distinguishedClubs)}%
        </span>
      </>
    ),
  },
  {
    id: 'visit1',
    label: 'Visit 1',
    title: 'First-round visits (75% of club base)',
    render: a => visitCell(a.firstRoundVisits),
  },
  {
    id: 'visit2',
    label: 'Visit 2',
    title: 'Second-round visits (75% of club base)',
    render: a => visitCell(a.secondRoundVisits),
  },
  {
    id: 'award',
    label: 'Award',
    title: 'Area recognition',
    render: a => {
      const badge = renderRecognitionBadge(a.recognitionState)
      return (
        <span
          className={`priority-columns__badge border ${badge.className}`}
          title={
            badge.tooltip ? `${badge.label}. ${badge.tooltip}` : badge.label
          }
        >
          <span aria-hidden="true">{shortBadgeLabel(badge.label)}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )
    },
  },
  {
    id: 'gapD',
    label: 'Gap D',
    title: 'Distinguished clubs still needed for Distinguished (50% of base)',
    render: a =>
      gapCell(
        calculateAreaGapAnalysis({
          clubBase: a.clubBase,
          paidClubs: a.paidClubs,
          distinguishedClubs: a.distinguishedClubs,
        }).distinguishedGap
      ),
  },
  {
    id: 'gapS',
    label: 'Gap S',
    title: 'Distinguished clubs still needed for Select (50% + 1)',
    render: a =>
      gapCell(
        calculateAreaGapAnalysis({
          clubBase: a.clubBase,
          paidClubs: a.paidClubs,
          distinguishedClubs: a.distinguishedClubs,
        }).selectGap
      ),
  },
  {
    id: 'gapP',
    label: 'Gap P',
    title: "Distinguished clubs still needed for President's (base+1, 50%+1)",
    render: a =>
      gapCell(
        calculateAreaGapAnalysis({
          clubBase: a.clubBase,
          paidClubs: a.paidClubs,
          distinguishedClubs: a.distinguishedClubs,
        }).presidentsGap
      ),
  },
]

/**
 * AreaPerformanceTable Component
 *
 * Displays a comprehensive table of area performance metrics within a division.
 * Each row represents a single area and shows:
 * - Area identifier
 * - Paid/Base: paid clubs count vs club base with percentage
 * - Distinguished: distinguished clubs count vs club base with percentage
 * - First Round Visits: first round visit completion status
 * - Second Round Visits: second round visit completion status
 * - Recognition: badge showing current recognition level
 * - Gap to D: distinguished clubs needed for Distinguished
 * - Gap to S: distinguished clubs needed for Select Distinguished
 * - Gap to P: distinguished clubs needed for President's Distinguished
 *
 * The table follows Toastmasters brand guidelines with proper typography,
 * colors, and accessibility features including semantic table structure,
 * proper headers, and minimum touch targets.
 *
 * Requirements:
 * - 9.1: Display columns in order: Area, Paid/Base, Distinguished, First Round Visits,
 *        Second Round Visits, Recognition, Gap to D, Gap to S, Gap to P
 * - 9.2: Paid/Base column shows paid clubs count vs club base with percentage
 * - 9.3: Distinguished column shows distinguished clubs count vs club base with percentage
 * - 9.5: Recognition column displays badge indicating current recognition level
 * - 9.6: Gap columns show number of additional distinguished clubs needed
 * - 6.8: Order areas by area identifier
 * - 8.6: Ensure minimum 44px touch targets for interactive elements
 * - 8.7: Apply responsive table styling
 *
 * @component
 * @example
 * ```tsx
 * <AreaPerformanceTable
 *   areas={[
 *     {
 *       areaId: "A1",
 *       status: "distinguished",
 *       clubBase: 10,
 *       paidClubs: 11,
 *       netGrowth: 1,
 *       distinguishedClubs: 6,
 *       requiredDistinguishedClubs: 5,
 *       firstRoundVisits: { completed: 8, required: 8, percentage: 80, meetsThreshold: true },
 *       secondRoundVisits: { completed: 8, required: 8, percentage: 80, meetsThreshold: true },
 *       isQualified: true
 *     }
 *   ]}
 * />
 * ```
 */
export const AreaPerformanceTable: React.FC<AreaPerformanceTableProps> = ({
  areas,
  label = 'Area performance',
}) => {
  // Sort areas by area identifier (Requirement 6.8)
  const sortedAreas = [...areas].sort((a, b) =>
    a.areaId.localeCompare(b.areaId)
  )

  const fullTable = (
    <table className="dt entity-table entity-table--areas">
      <caption className="sr-only">{`${label}, recognition by area`}</caption>
      <thead>
        <tr>
          <th scope="col">Area</th>
          <th scope="col" className="entity-table__c">
            Paid / Base
            <span className="entity-table__sub">(≥ club base required)</span>
          </th>
          <th scope="col" className="entity-table__c">
            Distinguished
            <span className="entity-table__sub">(of club base)</span>
          </th>
          <th scope="col" className="entity-table__c">
            First round visits
            <span className="entity-table__sub">(75% of club base)</span>
          </th>
          <th scope="col" className="entity-table__c">
            Second round visits
            <span className="entity-table__sub">(75% of club base)</span>
          </th>
          <th scope="col" className="entity-table__c">
            Recognition
          </th>
          <th scope="col" className="entity-table__c">
            Gap to D<span className="entity-table__sub">(50% of base)</span>
          </th>
          <th scope="col" className="entity-table__c">
            Gap to S<span className="entity-table__sub">(50% + 1)</span>
          </th>
          <th scope="col" className="entity-table__c">
            Gap to P<span className="entity-table__sub">(base+1, 50%+1)</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedAreas.map(area => {
          const gapAnalysis = calculateAreaGapAnalysis({
            clubBase: area.clubBase,
            paidClubs: area.paidClubs,
            distinguishedClubs: area.distinguishedClubs,
          })
          const paidPercentage = calculatePaidClubsPercentage(
            area.clubBase,
            area.paidClubs
          )
          const distinguishedPercentage = calculateDistinguishedPercentage(
            area.clubBase,
            area.distinguishedClubs
          )

          // Source-of-truth recognition badge (#832) — visit-deadline gate
          // lives in `deriveAreaRecognitionState`; this is a pure presenter.
          const badge = renderRecognitionBadge(area.recognitionState)

          return (
            <tr key={area.areaId}>
              <th scope="row">{area.areaId}</th>
              <td className="entity-table__c tabular">
                {area.paidClubs}/{area.clubBase} {paidPercentage}%
              </td>
              <td className="entity-table__c tabular">
                {area.distinguishedClubs}/{area.clubBase}{' '}
                {distinguishedPercentage}%
              </td>
              <td className="entity-table__c">
                {visitCell(area.firstRoundVisits)}
              </td>
              <td className="entity-table__c">
                {visitCell(area.secondRoundVisits)}
              </td>
              <td className="entity-table__c">
                <span
                  className={`px-2 py-1 text-sm font-medium rounded-full border ${badge.className}`}
                  aria-label={`Recognition status: ${badge.label}`}
                >
                  {badge.label}
                </span>
                {/* The meaning was a `title`: touch and keyboard now open it
                    (#2644). */}
                {badge.tooltip && (
                  <InfoTooltip
                    label={`area ${area.areaId} recognition`}
                    text={badge.tooltip}
                  />
                )}
              </td>
              <td className="entity-table__c tabular">
                {gapCell(gapAnalysis.distinguishedGap)}
              </td>
              <td className="entity-table__c tabular">
                {gapCell(gapAnalysis.selectGap)}
              </td>
              <td className="entity-table__c tabular">
                {gapCell(gapAnalysis.presidentsGap)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  // Below 1024 (#1834, #2718): area + 2 chosen metrics, no side-scroll; the
  // complete 9-column table moves into the full-screen sheet.
  return (
    <PriorityColumnsTable<AreaPerformance, never>
      label={label}
      rows={sortedAreas}
      rowKey={a => a.areaId}
      identityHeader="Area"
      renderIdentity={a => <span className="font-semibold">{a.areaId}</span>}
      metrics={PHONE_METRICS}
      defaultMetricIds={['paid', 'award']}
      fullTableTitle={`${label} — all columns`}
      // The nine-column table needs about 730px, which the 654px content box
      // of a 768px tablet cannot hold: the phone layout runs to 1024 (UNIT-16).
      breakpoint={1024}
      sheetTable={fullTable}
      fullTable={
        <StaticTableScroll label={label}>{fullTable}</StaticTableScroll>
      }
    />
  )
}
