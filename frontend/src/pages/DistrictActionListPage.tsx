import React, { useMemo } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { extractDivisionPerformance } from '../utils/extractDivisionPerformance'
import {
  buildActionList,
  compareId,
  describeActionSections,
  formatCloseGap,
  formatCloseNeeds,
  formatCspRow,
  formatVisitGap,
  orderActionSections,
  type ActionListSections,
  type ActionSectionId,
  type CloseToDistinguishedItem,
  type CspNotSubmittedItem,
  type InterventionItem,
  type VisitGapArea,
} from '../utils/actionListData'
import { usePersistedState } from '../hooks/usePersistedState'
import { getClubHealthStatusLabel } from '../utils/clubHealthStatus'
import {
  CSP_LOST_ELIGIBILITY,
  cspAutoCreditNote,
  formatCspDueDate,
} from '../utils/cspDeadlines'
import { ActionTable, type ActionTableColumn } from '../components/ActionTable'
import type { MobileRow } from '../components/MobileRowList'
import { StatusChip } from '../components/StatusChip'
import { getClubHealthStatusShortLabel } from '../utils/clubHealthStatus'
import { arrayToCSV, downloadCSV, generateFilename } from '../utils/csvExport'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { isDistrictSlotPending } from '../utils/districtSlotPending'
import {
  formatNeeded,
  parseTrainingThreshold,
  thresholdPhrase,
  trainingClubsFromSnapshot,
  trainingPageUrl,
  type ShortClub,
} from '../utils/officerTraining'
import { formatDisplayDate } from '../utils/dateFormatting'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Action List Page (#1231, epic #1228 Sprint 3 — the epic's close).
   RAFFETY's "Almost Distinguished" / "Area To-Do" reports made action-oriented
   and shareable: a deep-linkable destination scoped to a district (and
   filterable to a division/area via URL-synced `?division=`/`?area=`).

   Reuse-only (R7): every row comes from existing predicates via `buildActionList`
   — `isCloseToDistinguished` + `calculateClubProjection` for the gap, the
   deadline-aware `AreaPerformance.clubsMissingCurrentRoundVisit`/`currentRound`
   for visit gaps, and the club-health `currentStatus` for intervention. The page
   OWNS the scope state and passes it to the pure derivation (R3 / Lesson 124);
   the scope whitelist is irrelevant because an out-of-range slice simply yields
   empty sections (Lesson 144).

   Fourth section (#1555): clubs without a Club Success Plan, from the same
   analytics rows, gated on the program year this page owns — a pre-2025-26
   year shows neither the section nor the intro clause (never "0 of N" for a
   year with no requirement).

   Collapsible sections (#1569): each section is a disclosure whose open/closed
   state is remembered per browser; the FIRST is open by default. Their ORDER
   comes from `orderActionSections`, which puts the Club Success Plan section
   first while a plan can still earn credit and last once the deadline has
   passed — decided by this page's own program year and pinned date (R3), so a
   pinned historical snapshot orders them the way they should have appeared on
   its own date, and never by the wall clock. The rendered list, the intro
   sentence and the CSV export all read that one array.

   Aligned tables (#1577): each section's rows became a real <table> at ~28px
   per row, because at 107 CSP clubs the win is as much scanability as density
   — the area and the requirement line up vertically instead of sitting ragged
   after names of varying length. The four payloads differ, so the COLUMNS are
   per-section (see the *Columns builders below) and only the chrome is shared
   (<ActionTable>). The CSV keeps the one-sentence `format*` Detail column it
   always had: the columns are a display split, not a data change. */

interface ScopeOption {
  /** Division ids present in the snapshot, sorted. */
  divisions: string[]
  /** Area ids for the active division (or all areas when unscoped), sorted. */
  areas: string[]
}

/** One section's rendered identity and its CSV lines, side by side (#1569). */
interface ActionSectionView {
  testId: string
  heading: string
  count: number
  emptyText: string
  footnote?: string | undefined
  /** Rows for the CSV export, in the same order as the rendered list. */
  csvRows: (string | number)[][]
  children: React.ReactNode
}

/** localStorage name (via the versioned primitive) for the collapse
 *  preference. ONE key for the page, not per district: which sections a
 *  director likes open is a working preference, not data about a district —
 *  and it is never put in the URL, so a shared link never carries it (#1569). */
const COLLAPSE_STORAGE_NAME = 'action-list-sections'

/** `true` when the viewer asked the OS to reduce motion. Wrapped because a
 *  non-browser/oddly-sandboxed environment can throw on matchMedia. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** One action section, as a WAI-ARIA disclosure (#1569): a heading-wrapped
 *  <button> carrying `aria-expanded`/`aria-controls` over a panel holding
 *  either the empty state or the caller-supplied body — since #1577 an
 *  <ActionTable> — plus an optional footnote (e.g. "3 suspended/ineligible
 *  clubs … are not listed").
 *
 *  The count badge lives INSIDE the button, so it stays visible while the
 *  section is collapsed and is part of the button's accessible name — a
 *  screen-reader user hears the total without expanding. `id` sits on the
 *  button rather than the heading so `#action-csp` (linked from the district
 *  overview's headline number) still resolves, and so `aria-labelledby` names
 *  the section with heading + count.
 *
 *  Collapsed rows stay mounted behind `hidden`, which takes them out of the
 *  accessibility tree and out of tab order — the CSV export reads the data,
 *  never the DOM, so collapsing can never narrow it. */
const ActionListSection: React.FC<{
  id: ActionSectionId
  testId: string
  heading: string
  count: number
  emptyText: string
  footnote?: string | undefined
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}> = ({
  id,
  testId,
  heading,
  count,
  emptyText,
  footnote,
  open,
  onToggle,
  children,
}) => {
  const panelId = `${id}-panel`
  return (
    <section
      className="action-list-section"
      aria-labelledby={id}
      data-testid={testId}
    >
      <h3 className="action-list-section__heading">
        <button
          type="button"
          id={id}
          className="action-list-section__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="action-list-section__chevron" aria-hidden="true" />
          <span className="action-list-section__heading-text">
            {heading}
          </span>{' '}
          {/* The space above is load-bearing: without a text node between the
              two spans the accessible name concatenates to "…Plan1". A
              whitespace-only run is not rendered as a flex item, so it costs
              nothing visually. */}
          <span className="action-list-section__count">{count}</span>
        </button>
      </h3>
      <div id={panelId} className="action-list-section__panel" hidden={!open}>
        {count === 0 ? (
          <p className="action-list-section__empty">{emptyText}</p>
        ) : (
          children
        )}
        {footnote && (
          <p className="action-list-section__footnote">{footnote}</p>
        )}
      </div>
    </section>
  )
}

/** "1 suspended/ineligible club without a plan is not listed." / "1 club
 *  chartered after 1 April has automatic credit and is not listed." / "(2
 *  clubs with no CSP data)" — the CSP section's footnote, or undefined when
 *  there is nothing to flag. */
function cspFootnote(sections: ActionListSections): string | undefined {
  const parts: string[] = []
  const inel = sections.cspNotSubmittedIneligibleCount
  if (inel > 0) {
    parts.push(
      inel === 1
        ? '1 suspended/ineligible club without a plan is not listed.'
        : `${inel} suspended/ineligible clubs without a plan are not listed.`
    )
  }
  // #1565: chartered after 1 April — automatic credit, so never a to-do.
  const autoCredit = sections.cspNotSubmittedAutoCreditCount
  if (autoCredit > 0) {
    parts.push(
      `${cspAutoCreditNote(autoCredit)} and ${autoCredit === 1 ? 'is' : 'are'} not listed.`
    )
  }
  const unknown = sections.cspUnknownCount
  if (unknown > 0) {
    parts.push(`(${unknown} club${unknown === 1 ? '' : 's'} with no CSP data)`)
  }
  /* #1577 — the lost-eligibility consequence used to be repeated in every
     row's sentence (#1565). In a 28px-per-row table that sentence is both the
     tallest thing on the page and the same on all 107 rows, so the row keeps
     the marker and the section states the consequence ONCE, reusing the same
     constant so the two can never drift. */
  if (sections.cspNotSubmitted.some(c => c.cspOverdue)) {
    parts.unshift(`Clubs marked overdue ${CSP_LOST_ELIGIBILITY}.`)
  }
  return parts.length > 0 ? parts.join(' ') : undefined
}

/* Per-section column schemas (#1577). The four sections carry different
   payloads — one of them is about AREAS, not clubs — so a single schema does
   not fit; what they share is the chrome in <ActionTable>. Each `cell` reads
   the row it is given and nothing else.

   Three of the four lead with the same club link over the same division/area
   pair, so those two columns are defined ONCE and reused: a second copy of a
   link shape is a second thing to drift. */

/** Any row that names a club and the division/area it sits in. */
interface ClubRow {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
}

/** The lead column: the club's name, linking to its club page. */
const clubColumn = <T extends ClubRow>(
  districtId: string
): ActionTableColumn<T> => ({
  key: 'club',
  header: 'Club',
  className: 'action-table__subject',
  cell: row => (
    <Link
      className="action-table__link"
      to={`/district/${districtId}/club/${row.clubId}`}
    >
      {row.clubName}
    </Link>
  ),
})

/** "A/01" — the division/area the club sits in, as its own aligned column. */
const areaColumn = <T extends ClubRow>(): ActionTableColumn<T> => ({
  key: 'area',
  header: 'Area',
  className: 'action-table__area',
  cell: row => `${row.divisionId}/${row.areaId}`,
})

const closeColumns = (
  districtId: string
): ActionTableColumn<CloseToDistinguishedItem>[] => [
  clubColumn(districtId),
  areaColumn(),
  { key: 'needs', header: 'Needs', cell: c => formatCloseNeeds(c) },
]

const visitColumns = (
  districtId: string
): ActionTableColumn<VisitGapArea>[] => [
  {
    key: 'area',
    header: 'Area',
    className: 'action-table__subject',
    // The subject here is an AREA, so the lead column links to the area page —
    // this section has no club link at all.
    cell: g => (
      <Link
        className="action-table__link"
        to={`/district/${districtId}/division/${g.divisionId}/area/${g.areaId}`}
      >
        Area {g.areaId}
      </Link>
    ),
  },
  {
    key: 'unvisited',
    header: 'Unvisited',
    className: 'action-table__num',
    cell: g => g.missingClubs.length,
  },
  {
    key: 'round',
    header: 'Round',
    className: 'action-table__num',
    cell: g => g.currentRound,
  },
  { key: 'due', header: 'Due', cell: g => g.deadline },
]

const interventionColumns = (
  districtId: string
): ActionTableColumn<InterventionItem>[] => [
  clubColumn(districtId),
  areaColumn(),
  {
    key: 'status',
    header: 'Status',
    cell: () => getClubHealthStatusLabel('intervention-required'),
  },
]

const cspColumns = (
  districtId: string
): ActionTableColumn<CspNotSubmittedItem>[] => [
  clubColumn(districtId),
  areaColumn(),
  {
    key: 'due',
    header: 'Due',
    cell: c =>
      c.cspOverdue ? (
        <>
          {formatCspDueDate(c.cspDueDate)}
          <span className="action-table__flag">{' · overdue'}</span>
        </>
      ) : (
        formatCspDueDate(c.cspDueDate)
      ),
  },
  {
    key: 'health',
    header: 'Health',
    cell: c => getClubHealthStatusLabel(c.currentStatus),
  },
]

/* Officer training (#2296): clubs short of the threshold in the open round. */
const trainingColumns = (
  districtId: string
): ActionTableColumn<ShortClub>[] => [
  clubColumn(districtId),
  areaColumn(),
  {
    key: 'trained',
    header: 'Trained',
    className: 'action-table__num',
    cell: c => c.trained,
  },
  { key: 'needs', header: 'Needs', cell: c => formatNeeded(c.needed) },
]

/* Phone rows (#1833): below 768 each section is MobileRowList compact rows.
   Line 1 is the subject (club or area), line 2 carries the facts the table's
   other columns held; the whole row links to the subject's routed page. */
const clubTo = (districtId: string, row: ClubRow) =>
  `/district/${districtId}/club/${row.clubId}`
const areaLabel = (row: ClubRow) => `Area ${row.divisionId}/${row.areaId}`

const closeMobileRow =
  (districtId: string) =>
  (c: CloseToDistinguishedItem): MobileRow => ({
    id: c.clubId,
    to: clubTo(districtId, c),
    title: c.clubName,
    meta: `${c.divisionId}/${c.areaId} \u00b7 ${formatCloseNeeds(c)}`,
  })

const visitMobileRow =
  (districtId: string) =>
  (g: VisitGapArea): MobileRow => ({
    id: `${g.divisionId}-${g.areaId}`,
    to: `/district/${districtId}/division/${g.divisionId}/area/${g.areaId}`,
    title: `Area ${g.areaId}`,
    meta: `${g.missingClubs.length} unvisited \u00b7 Round ${g.currentRound} \u00b7 due ${g.deadline}`,
  })

const interventionMobileRow =
  (districtId: string) =>
  (i: InterventionItem): MobileRow => ({
    id: i.clubId,
    to: clubTo(districtId, i),
    title: i.clubName,
    chip: (
      <StatusChip
        status="intervention-required"
        label={getClubHealthStatusShortLabel('intervention-required')}
      />
    ),
    meta: areaLabel(i),
  })

const cspMobileRow =
  (districtId: string) =>
  (c: CspNotSubmittedItem): MobileRow => ({
    id: c.clubId,
    to: clubTo(districtId, c),
    title: c.clubName,
    chip: (
      <StatusChip
        status={c.currentStatus}
        label={getClubHealthStatusShortLabel(c.currentStatus)}
      />
    ),
    meta: `${areaLabel(c)} \u00b7 Due ${formatCspDueDate(c.cspDueDate)}${
      c.cspOverdue ? ' \u00b7 overdue' : ''
    }`,
  })

const trainingMobileRow =
  (districtId: string) =>
  (c: ShortClub): MobileRow => ({
    id: c.clubId,
    to: clubTo(districtId, c),
    title: c.clubName,
    meta: `${areaLabel(c)} \u00b7 ${c.trained} trained \u00b7 needs ${formatNeeded(c.needed)}`,
  })

const DistrictActionListPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // Scope is URL-seedable (typed URL, shared link, back button, select change),
  // so it is read at the single parse point every entry path converges on
  // (L124/144 / R17). An empty string is treated as "no filter".
  const division = searchParams.get('division') || undefined
  const area = searchParams.get('area') || undefined
  // #2296: the officer-training threshold shares the Training page's
  // `?threshold=` (1–7, default 4), so a shared incentive link carries it.
  const trainingThreshold = parseTrainingThreshold(
    searchParams.get('threshold')
  )

  const setScope = (next: {
    division?: string | undefined
    area?: string | undefined
  }) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev)
        if (next.division) params.set('division', next.division)
        else params.delete('division')
        if (next.area) params.set('area', next.area)
        else params.delete('area')
        return params
      },
      { replace: true }
    )
  }

  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )

  const { data: cachedDatesData, isPending: isDatesPending } =
    useDistrictCachedDates(districtId || '')
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )
  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  React.useEffect(() => {
    if (availableProgramYears.length > 0) {
      const has = availableProgramYears.some(
        py => py.year === selectedProgramYear.year
      )
      if (!has) {
        const mostRecent = availableProgramYears[0]
        if (mostRecent) setSelectedProgramYear(mostRecent)
      }
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  const cachedDatesInProgramYear = useMemo(
    () => filterDatesByProgramYear(allCachedDates, selectedProgramYear),
    [allCachedDates, selectedProgramYear]
  )

  const effectiveProgramYear = useMemo(() => {
    if (availableProgramYears.length === 0) return null
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (has) return selectedProgramYear
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  const effectiveEndDate = useMemo(() => {
    if (!effectiveProgramYear) return null
    if (
      selectedDate &&
      isDateInProgramYear(selectedDate, effectiveProgramYear)
    ) {
      return selectedDate
    }
    const mostRecent = getMostRecentDateInProgramYear(
      allCachedDates,
      effectiveProgramYear
    )
    // null is unreachable here — effectiveProgramYear comes from
    // getAvailableProgramYears(allCachedDates). See getMostRecentDateInProgramYear
    // for why, and why a `|| endDate` fallback must not come back (#1323).
    return mostRecent
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: isAnalyticsError,
  } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const {
    data: districtStatistics,
    isLoading: statsLoading,
    isError: isStatsError,
  } = useDistrictStatistics(
    hasValidDates ? districtId || null : null,
    effectiveEndDate ?? undefined,
    'divisions'
  )

  // The visit-round gate keys on the date this page pinned its snapshot query
  // to (#1321), never the wall clock.
  const divisionPerformance = useMemo(
    () =>
      districtStatistics && effectiveEndDate
        ? extractDivisionPerformance(districtStatistics, effectiveEndDate)
        : [],
    [districtStatistics, effectiveEndDate]
  )

  // #2296: officers trained per club, from the same snapshot (no new read).
  const trainingClubs = useMemo(
    () => trainingClubsFromSnapshot(districtStatistics),
    [districtStatistics]
  )

  const sections = useMemo<ActionListSections>(() => {
    // buildActionList already returns empty sections for empty input, so no
    // separate no-data guard is needed — the `?? []` fallbacks make it safe.
    return buildActionList(
      {
        clubs: analytics?.allClubs ?? [],
        interventionClubs: analytics?.interventionRequiredClubs ?? [],
        divisions: divisionPerformance,
        snapshotDate: effectiveEndDate ?? '',
        // #1406 — the page owns the program-year selection; the recognition
        // ladder must not be re-derived downstream (R3).
        programYear: effectiveProgramYear?.label,
        trainingClubs,
        trainingThreshold,
      },
      { division, area }
    )
  }, [
    analytics,
    divisionPerformance,
    effectiveEndDate,
    effectiveProgramYear,
    division,
    area,
    trainingClubs,
    trainingThreshold,
  ])

  // Scope-select options come from the authoritative division/area structure.
  const scopeOptions = useMemo<ScopeOption>(() => {
    const divisions = [
      ...new Set(divisionPerformance.map(d => d.divisionId)),
    ].sort(compareId)
    const areaSource = division
      ? (divisionPerformance.find(d => d.divisionId === division)?.areas ?? [])
      : divisionPerformance.flatMap(d => d.areas)
    const areas = [...new Set(areaSource.map(a => a.areaId))].sort(compareId)
    return { divisions, areas }
  }, [divisionPerformance, division])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Action List` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  const isLoading = analyticsLoading || statsLoading
  // #1837: both queries are disabled until the date index resolves, and a
  // disabled query reports `isLoading: false` — so the page rendered four
  // empty, collapsed sections for that window, and the loaded first section
  // then expanded over them (CLS 0.23 at 375px). The sections are built from
  // BOTH reads, so the skeleton holds until each has settled: rendering on
  // the first one paints sections the second one then resizes.
  const datesState = { hasValidDates, datesSettled: !isDatesPending }
  const isAwaitingData =
    isDistrictSlotPending(
      { hasData: !!analytics, isError: !!isAnalyticsError },
      datesState
    ) ||
    isDistrictSlotPending(
      { hasData: !!districtStatistics, isError: !!isStatsError },
      datesState
    )
  const totalItems =
    sections.trainingShort.length +
    sections.closeToDistinguished.length +
    sections.visitGaps.length +
    sections.interventionRequired.length +
    sections.cspNotSubmitted.length
  const showSectionsSkeleton = isAwaitingData || (isLoading && totalItems === 0)

  /* Render order (#1569) — computed from the page's own program year and
     pinned date via `cspActionable`, never a clock, so a pinned historical
     snapshot orders the sections the way they should have appeared on its own
     date. The rendered list, the intro copy and the CSV all read this one
     array, so they cannot drift apart. */
  const sectionOrder = useMemo(() => orderActionSections(sections), [sections])

  /* Collapse preference — per viewer, per device, ONE key for the page, never
     in the URL (a shared link must not carry it). Reads and writes go through
     the versioned localStorage primitive, which swallows a blocked or throwing
     store, so a private window silently gets the default. */
  const [openSections, setOpenSections] = usePersistedState<
    Partial<Record<ActionSectionId, boolean>>
  >(COLLAPSE_STORAGE_NAME, {})

  /* The default is "the FIRST section is expanded, the rest collapsed" —
     expressed against the rendered order rather than naming a section, so it
     stays correct after the seasonal reorder above. */
  const isSectionOpen = (id: ActionSectionId) =>
    openSections[id] ?? sectionOrder[0] === id

  const toggleSection = (id: ActionSectionId) => {
    const next = !isSectionOpen(id)
    setOpenSections(prev => ({ ...prev, [id]: next }))
  }

  /* `/district/:id/action-list#action-csp` is the district overview's headline
     link. Following it must OPEN the section and bring it into view even when
     the default or a stored preference has it collapsed — otherwise the
     overview's number points at something invisible. */
  const { hash } = useLocation()
  const sectionsRendered = !showSectionsSkeleton
  React.useEffect(() => {
    const target = hash.replace(/^#/, '') as ActionSectionId
    if (!sectionsRendered || !sectionOrder.includes(target)) return
    setOpenSections(prev => (prev[target] ? prev : { ...prev, [target]: true }))
    document.getElementById(target)?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [hash, sectionOrder, sectionsRendered, setOpenSections])

  /** Everything a section needs — heading, rows and CSV lines together in one
   *  place, keyed by the id that orders them. A section that is absent for the
   *  program year is dropped by `sectionOrder` alone, so neither the render
   *  loop nor the export special-cases it (#1569). */
  const sectionViews: Record<ActionSectionId, ActionSectionView> = {
    'action-close': {
      testId: 'section-close',
      heading: 'Clubs close to Distinguished',
      count: sections.closeToDistinguished.length,
      emptyText: 'No clubs are within reach of Distinguished for this scope.',
      csvRows: sections.closeToDistinguished.map(c => [
        'Close to Distinguished',
        c.divisionId,
        c.areaId,
        c.clubName,
        formatCloseGap(c),
      ]),
      children: (
        <ActionTable
          caption="Clubs close to Distinguished"
          columns={closeColumns(districtId ?? '')}
          rows={sections.closeToDistinguished}
          rowKey={c => c.clubId}
          testId="table-close"
          mobileRow={closeMobileRow(districtId ?? '')}
        />
      ),
    },
    'action-visits': {
      testId: 'section-visits',
      heading: 'Areas missing club visits',
      count: sections.visitGaps.length,
      emptyText:
        "Every area has completed the current round's club visits for this scope.",
      csvRows: sections.visitGaps.map(g => [
        'Missing club visits',
        g.divisionId,
        g.areaId,
        `Area ${g.areaId}`,
        formatVisitGap(g),
      ]),
      children: (
        <ActionTable
          caption="Areas missing club visits"
          columns={visitColumns(districtId ?? '')}
          rows={sections.visitGaps}
          rowKey={g => `${g.divisionId}-${g.areaId}`}
          testId="table-visits"
          mobileRow={visitMobileRow(districtId ?? '')}
        />
      ),
    },
    'action-intervention': {
      testId: 'section-intervention',
      heading: 'Clubs needing intervention',
      count: sections.interventionRequired.length,
      emptyText: 'No clubs are flagged intervention-required for this scope.',
      csvRows: sections.interventionRequired.map(i => [
        'Intervention required',
        i.divisionId,
        i.areaId,
        i.clubName,
        'Club health: intervention required',
      ]),
      children: (
        <ActionTable
          caption="Clubs needing intervention"
          columns={interventionColumns(districtId ?? '')}
          rows={sections.interventionRequired}
          rowKey={i => i.clubId}
          testId="table-intervention"
          mobileRow={interventionMobileRow(districtId ?? '')}
        />
      ),
    },
    'action-training': {
      testId: 'section-training',
      heading: sections.trainingRound
        ? `Clubs short of ${thresholdPhrase(sections.trainingThreshold)} · Round ${sections.trainingRound.round}`
        : 'Clubs short of officer training',
      count: sections.trainingShort.length,
      emptyText: `Every club in this scope has ${thresholdPhrase(sections.trainingThreshold)} this round.`,
      footnote: sections.trainingRound
        ? `${sections.trainingDaysLeft} day${sections.trainingDaysLeft === 1 ? '' : 's'} left in the round, to ${formatDisplayDate(sections.trainingRound.end)}. Counts are officers trained, not which officers.`
        : undefined,
      csvRows: sections.trainingShort.map(c => [
        'Officer training',
        c.divisionId,
        c.areaId,
        c.clubName,
        `${c.trained} trained, needs ${formatNeeded(c.needed)}`,
      ]),
      children: (
        <>
          <ActionTable
            caption="Clubs short of officer training this round"
            columns={trainingColumns(districtId ?? '')}
            rows={sections.trainingShort}
            rowKey={c => c.clubId}
            testId="table-training"
            mobileRow={trainingMobileRow(districtId ?? '')}
          />
          <p className="action-list-section__footnote">
            <Link
              to={trainingPageUrl(districtId ?? '', {
                division,
                area,
                threshold: sections.trainingThreshold,
              })}
            >
              See every club on the Training page
            </Link>
          </p>
        </>
      ),
    },
    'action-csp': {
      testId: 'section-csp',
      heading: 'Clubs without a Club Success Plan',
      count: sections.cspNotSubmitted.length,
      emptyText:
        'Every active club in this scope has submitted its Club Success Plan.',
      footnote: cspFootnote(sections),
      csvRows: sections.cspNotSubmitted.map(c => [
        'Club Success Plan not submitted',
        c.divisionId,
        c.areaId,
        c.clubName,
        formatCspRow(c),
      ]),
      children: (
        <ActionTable
          caption="Clubs without a Club Success Plan"
          columns={cspColumns(districtId ?? '')}
          rows={sections.cspNotSubmitted}
          rowKey={c => c.clubId}
          testId="table-csp"
          mobileRow={cspMobileRow(districtId ?? '')}
        />
      ),
    },
  }

  const handleExport = () => {
    if (!districtId) return
    const rows: (string | number)[][] = [
      ['Section', 'Division', 'Area', 'Item', 'Detail'],
    ]
    // Display order, and complete regardless of collapse state — collapsing is
    // a view concern, never a filter (#1569).
    for (const id of sectionOrder) rows.push(...sectionViews[id].csvRows)
    downloadCSV(arrayToCSV(rows), generateFilename('action-list', districtId))
  }

  if (!districtId) {
    return null
  }

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
          <DistrictDetailHeader
            districtId={districtId}
            districtName={districtName}
            selectedProgramYear={selectedProgramYear}
            setSelectedProgramYear={setSelectedProgramYear}
            availableProgramYears={availableProgramYears}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            availableDates={availableDates}
            latestSnapshotDate={
              cachedDatesData?.dateRange?.endDate ?? availableDates[0]
            }
          />

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          <div className="action-list-page" data-testid="action-list-page">
            <header className="action-list-page__intro">
              <h2 className="action-list-page__title">Area Director Actions</h2>
              <p className="action-list-page__subtitle">
                {/* The clause order tracks the rendered order in both seasonal
                    windows, and drops the Club Success Plan clause with the
                    section (#1569). */}
                Prioritized to-dos for this district:{' '}
                {describeActionSections(sectionOrder)}. Filter to your division
                or area and share the link.
              </p>
            </header>

            <div className="action-list-page__controls">
              <div
                className="action-list-scope"
                role="group"
                aria-label="Scope"
              >
                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Division</span>
                  <select
                    className="action-list-scope__select"
                    value={division ?? ''}
                    onChange={e =>
                      // Changing division clears any area from a prior division.
                      setScope({ division: e.target.value || undefined })
                    }
                  >
                    <option value="">All divisions</option>
                    {scopeOptions.divisions.map(d => (
                      <option key={d} value={d}>
                        Division {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Area</span>
                  <select
                    className="action-list-scope__select"
                    value={area ?? ''}
                    onChange={e =>
                      setScope({
                        division,
                        area: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">All areas</option>
                    {scopeOptions.areas.map(a => (
                      <option key={a} value={a}>
                        Area {a}
                      </option>
                    ))}
                  </select>
                </label>

                {(division || area) && (
                  <button
                    type="button"
                    className="action-list-scope__clear"
                    onClick={() => setScope({})}
                  >
                    Clear filter
                  </button>
                )}
              </div>

              <button
                type="button"
                className="action-list-page__export"
                onClick={handleExport}
                disabled={totalItems === 0}
              >
                Export CSV
              </button>
            </div>

            {showSectionsSkeleton ? (
              <LoadingSkeleton variant="table" count={3} />
            ) : (
              <div className="action-list-sections">
                {sectionOrder.map(id => {
                  const view = sectionViews[id]
                  return (
                    <ActionListSection
                      key={id}
                      id={id}
                      testId={view.testId}
                      heading={view.heading}
                      count={view.count}
                      emptyText={view.emptyText}
                      footnote={view.footnote}
                      open={isSectionOpen(id)}
                      onToggle={() => toggleSection(id)}
                    >
                      {view.children}
                    </ActionListSection>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictActionListPage
