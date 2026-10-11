import React from 'react'
import { useLocation } from 'react-router-dom'
import { DataControlsBar } from './DataControlsBar'
import { ContextBar, type ContextCrumb } from './ContextBar'
import { ContextSheetControls } from './ContextSheetControls'
import { DistrictSheetActions } from './DistrictSheetActions'
import { DISTRICT_SECTIONS } from '../config/districtSections'
import { formatFreshnessLine } from '../utils/contextBar'
import { HeaderActionsMenu } from './HeaderActionsMenu'
import { ProgramYearTitleSuffix } from './ProgramYearTitleSuffix'
import { useLatestAsOfDate } from '../hooks/useLatestAsOfDate'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'

/* District detail page header (#358). Extracted from DistrictDetailPage so
   redesign tests can mount this small component (~50 DOM nodes) instead
   of the entire 1084-line page (~1000+ nodes) — keeps the test suite
   under the 5s testTimeout cap when coverage is enabled.

   Per Epic #352 scope: dynamic Region/clubs/divisions/rank text in the
   lede is deferred to a follow-up sub-issue when the rank/region data
   flow is settled. */

interface DistrictDetailHeaderProps {
  districtId: string
  districtName: string
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (py: ProgramYear) => void
  availableProgramYears: ProgramYear[]
  selectedDate: SnapshotDate | undefined
  onDateChange: (date: SnapshotDate | undefined) => void
  availableDates: SnapshotDate[]
  latestSnapshotDate: string | undefined
  /**
   * True while the snapshot date is still resolving (#1647). The header then
   * reserves the freshness pill's slot so the toolbar's wrap is settled from
   * the first paint — at phone widths the late pill rewrapped it from one
   * row to three and shifted the page.
   */
  freshnessPending?: boolean
}

const LEDE =
  'Membership, payments, divisions, and ranking trend for the selected program year.'

/** The section segment after /district/:id ('' on the hub). */
function sectionSegment(pathname: string, districtId: string): string {
  const prefix = `/district/${districtId}`
  if (!pathname.startsWith(prefix)) return ''
  return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '')
}

export const DistrictDetailHeader: React.FC<DistrictDetailHeaderProps> = ({
  districtId,
  districtName,
  selectedProgramYear,
  setSelectedProgramYear,
  availableProgramYears,
  selectedDate,
  onDateChange,
  availableDates,
  latestSnapshotDate,
  freshnessPending = false,
}) => {
  // Freshness parity (#1310): every district detail + subnav page shares this
  // header, and most fetch no per-district snapshot, so the as-of date comes
  // from the shared global source. The pill reflects the VIEWED date and only
  // flags month-end reconciliation when the viewed snapshot is BOTH the
  // district's latest AND the global pinned month-end — a district whose latest
  // snapshot lags the global scrape never mislabels reconciliation.
  const { asOfDate: globalAsOfDate, latestSnapshotDate: globalLatestSnapshot } =
    useLatestAsOfDate()
  const viewedDate = selectedDate ?? latestSnapshotDate
  const isLatest =
    (!selectedDate || selectedDate === latestSnapshotDate) &&
    !!latestSnapshotDate &&
    latestSnapshotDate === globalLatestSnapshot

  // Phone context bar (#1831): one level back — the hub backs up to the
  // districts list, every section backs up to the hub. The section label is
  // read from the route (navigation state, not data), never from a response.
  const { pathname } = useLocation()
  const segment = sectionSegment(pathname, districtId)
  const section = segment
    ? DISTRICT_SECTIONS.find(s => s.segment === segment)
    : undefined
  const hubUrl = `/district/${districtId}`
  const back = segment
    ? { label: districtName, to: hubUrl }
    : { label: 'Districts', to: '/' }
  const trail: ContextCrumb[] = section
    ? [
        { label: 'Districts', to: '/' },
        { label: districtName, to: hubUrl },
        { label: section.label },
      ]
    : [{ label: 'Districts', to: '/' }, { label: districtName }]
  const freshnessLine = formatFreshnessLine({
    asOfDate: isLatest ? globalAsOfDate : undefined,
    snapshotDate: viewedDate,
    isLatest,
  })

  return (
    <>
      <ContextBar
        title={districtName}
        back={back}
        programYear={selectedProgramYear}
        date={viewedDate}
        controls={
          <ContextSheetControls
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            freshness={freshnessLine}
          />
        }
        actions={<DistrictSheetActions districtId={districtId} />}
        about={LEDE}
        trail={trail}
      />
      {/* Breadcrumb removed per #442 — duplicated the AppShell's active
          'Districts' nav tab and the H1 below. The active nav + H1 give
          the user their location without redundant chrome. The
          breadcrumb on Club Detail still provides 'back to district'
          navigation since AppShell has no Club tab. */}
      <div className="district-detail-page-header">
        <div className="district-detail-page-header__intro">
          <p className="district-detail-page-header__eyebrow">
            Program Year {selectedProgramYear.label.replace(/-/g, '–')}
          </p>
          <h1 className="district-detail-page-header__title">
            {districtName}
            <ProgramYearTitleSuffix programYear={selectedProgramYear} />
          </h1>
          <p
            className="district-detail-page-header__lede"
            data-testid="district-detail-lede"
          >
            {LEDE}
          </p>
        </div>

        <div className="district-detail-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={viewedDate}
            asOfDate={isLatest ? globalAsOfDate : undefined}
            isLatest={isLatest}
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            freshnessPending={freshnessPending}
          />
          <HeaderActionsMenu districtId={districtId} />
        </div>
      </div>
    </>
  )
}
