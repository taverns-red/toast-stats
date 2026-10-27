import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  useTable,
  flexRender,
  type SortingState,
  type ColumnPinningState,
  type ColumnVisibilityState,
} from '@tanstack/react-table'
import type { SnapshotDiff } from '@taverns-red/shared-contracts'
import { ClubTrend } from '../hooks/useDistrictAnalytics'
import { calculateClubProjection } from '../utils/dcpProjections'
import { isCloseToDistinguished } from '../utils/closeToDistinguished'
import { ExportButton } from './ExportButton'
import { exportClubPerformance, exportSnapshotDiff } from '../utils/csvExport'
import { LoadingSkeleton } from './LoadingSkeleton'
import { useColumnFilters } from '../hooks/useColumnFilters'
import { ColumnHeader } from './ColumnHeader'
import { FiltersPanel } from './filters/FiltersPanel'
import { FilterSheet, type FilterSheetFacet } from './filters/FilterSheet'
import { PRESET_CLOSE_TO_DISTINGUISHED } from '../utils/clubFilterUrl'
import { ActiveFiltersBar } from './ActiveFiltersBar'
import { ColumnGroupsMenu } from './ColumnGroupsMenu'
import { describeActiveFilters } from '../utils/clubFilterDescribe'
import {
  SortField,
  SortDirection,
  COLUMN_CONFIGS,
  COLUMN_GROUPS,
  COLUMN_GROUP_IDS,
  STICKY_COLUMN_FIELD,
  type ColumnGroup,
  type ProcessedClubTrend,
} from './filters/types'
import { usePersistedState } from '../hooks/usePersistedState'
import {
  clubsColumns,
  clubColumnPriorityClass,
  clubColumnTdClass,
} from './clubsColumns'
import {
  clubsTableFeatures,
  type ClubsTableFeatures,
} from './clubsTableFeatures'
import {
  buildClubsDeltaColumns,
  CLUBS_DELTA_COLUMN_IDS,
} from './clubsDeltaColumns'
import {
  MobileRowList,
  type MobileRow,
  type MobileRowGroup,
} from './MobileRowList'
import { StatusChip } from './StatusChip'
import { ClubTrendSparkline, formatSignedNet } from './ClubTrendSparkline'
import {
  getClubHealthStatusLabel,
  getClubHealthStatusShortLabel,
} from '../utils/clubHealthStatus'
import { useIsMobile } from '../hooks/useIsMobile'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SHORT_LANDSCAPE_QUERY } from '../utils/contextBar'
import { ClubSearchBox } from './ClubSearchBox'

// The column model — order, headers, responsive priority (sticky key column +
// tablet-tier hiding), per-cell render, and the sort fns — lives in
// `clubsColumns.tsx` (the TanStack migration, #835). The DCP tier pill maps,
// status-rank sort key, and sticky/desktop priority that ClubsTable used to own
// inline moved there. ClubsTable keeps only the row-level concerns below.

/** Persisted-store name for the club table's hidden column groups (#819).
 *  Passed to the versioned localStorage primitive (#420), which prefixes it
 *  with `toast-stats:v<N>:` so it migrates with every other persisted key. */
const HIDDEN_GROUPS_STORAGE_NAME = 'clubs-table:hidden-groups'
/** Persisted opt-in toggle for the Changes group (#795). Stored independently
 *  of HIDDEN_GROUPS so the default (off) is honoured even for users whose
 *  hidden-groups store predates the group's existence. */
const CHANGES_VISIBLE_STORAGE_NAME = 'clubs-table:changes-visible'

const VALID_GROUPS = new Set<ColumnGroup>(COLUMN_GROUP_IDS)
/** A stale/corrupt store must never hide phantom groups or wedge the table
 *  into an unusable column set — keep only known group ids. */
const sanitizeHiddenGroups = (raw: unknown): ColumnGroup[] =>
  Array.isArray(raw)
    ? raw.filter((g): g is ColumnGroup => VALID_GROUPS.has(g as ColumnGroup))
    : []

/** Row-tint key for the sticky cell, so it can repaint OPAQUE per row status
 *  (a sticky cell must be opaque or scrolled columns bleed through it). Mirrors
 *  the row bg set by getRowColor: intervention → red-50, vulnerable → yellow-50,
 *  everything else → the themed --surface (no repaint needed). */
const rowTint = (
  status: 'thriving' | 'vulnerable' | 'intervention-required'
): 'intervention' | 'vulnerable' | 'none' =>
  status === 'intervention-required'
    ? 'intervention'
    : status === 'vulnerable'
      ? 'vulnerable'
      : 'none'

/**
 * Props for the ClubsTable component
 */
interface ClubsTableProps {
  /** Array of club trends to display in the table */
  clubs: ClubTrend[]
  /** District ID for export functionality */
  districtId: string
  /** Whether the data is currently loading */
  isLoading?: boolean
  /** Optional callback when a club row is clicked (whole-row mouse convenience;
   *  the club name itself is a real <Link> regardless — CC-7, #872). */
  onClubClick?: (club: ClubTrend) => void
  /** Router location state to attach to every club link (CC-7, #872). The
   *  clubs page passes `{ fromClubsSearch }` so the club page's breadcrumb can
   *  round-trip back to the exact filtered list (#577). */
  clubLinkState?: unknown
  /** Initial sort field from URL params (#230) */
  initialSortField?: SortField | undefined
  /** Initial sort direction from URL params (#230) */
  initialSortDirection?: SortDirection | undefined
  /** Callback when sort changes — for URL param sync (#230) */
  onSortChange?:
    ((field: SortField, direction: SortDirection) => void) | undefined
  /** Initial filter state from URL params (#272) */
  initialFilterState?: import('./filters/types').FilterState | undefined
  /** Callback when filters change — for URL param sync (#272) */
  onFilterChange?:
    ((state: import('./filters/types').FilterState) => void) | undefined
  /** Initial "Close to Distinguished" preset state from URL params (#979) */
  initialPresetActive?: boolean | undefined
  /** Callback when the preset toggles — for URL param sync (#979). */
  onPresetChange?: ((active: boolean) => void) | undefined
  /** Reference date for anniversary computation. Defaults to `new Date()`.
   *  Tests inject a fixed date to keep year counts deterministic (#448). */
  referenceDate?: Date
  /**
   * Snapshot-to-snapshot diff for the opt-in "Changes" column group (#795).
   * When provided, ClubsTable surfaces the five delta columns under the Changes
   * group (hidden by default, opt-in via the Columns menu) AND offers a sibling
   * CSV export of the diff. Absent ⇒ no Changes group, no diff export — the
   * table is byte-identical to its pre-#795 self.
   */
  snapshotDiff?: SnapshotDiff | undefined
  /**
   * Program year being shown ("YYYY-YYYY"), from the page that owns the
   * selection. The club recognition ladder varies by program year; this
   * component only threads the value to `ClubEligibilityUtils`, which holds
   * the ladder itself (#1406). Never re-derive it here (R3).
   * Omitted → the ladder's default.
   */
  programYear?: string | undefined
  /**
   * Division groups open in the phone row list (#1833). Owned by the page so
   * the open set lives in the URL and survives the club page round-trip (R3).
   * Omitted → local state, every group collapsed.
   */
  openGroups?: readonly string[] | undefined
  /** Called with the next open-group set when a division header is tapped. */
  onOpenGroupsChange?: ((next: string[]) => void) | undefined
  /**
   * The context bar's toolbar slot (#1912). In short landscape the table
   * portals its search + Filter & sort into it, renders the phone rows, and
   * moves the total + exports below them, so the first row clears 200px.
   * Omitted (or outside short landscape) → the usual layout.
   */
  compactToolbarTarget?: HTMLElement | null | undefined
}

/** Signed net change with a true minus sign; `null` when the base is unknown. */
function formatNet(club: ProcessedClubTrend): string | null {
  return club.netChange == null ? null : formatSignedNet(club.netChange)
}

/**
 * ClubsTable Component
 *
 * Displays a comprehensive, sortable, and filterable table of all clubs in a district.
 * The table provides rich functionality for analyzing club performance at a glance.
 *
 * Features:
 * - Individual column filtering with different filter types (text, numeric, categorical)
 * - Multi-column sorting with visual indicators
 * - Color-coded rows based on club health status
 * - All clubs in one sticky-header scroll container (no pagination, #667)
 * - CSV export functionality
 * - Click-through to detailed club view
 * - Loading skeletons and empty states
 * - Clear all filters functionality
 *
 * Performance Optimizations:
 * - Debounced text filtering (300ms) to reduce re-renders
 * - Memoized filtering and sorting
 * - Render budget guarded by a perf test (#667); virtualization deferred
 *   (epic #665) until a real district exceeds the budget
 *
 * @component
 * @example
 * ```tsx
 * <ClubsTable
 *   clubs={allClubs}
 *   districtId="123"
 *   isLoading={false}
 *   onClubClick={(club) => showClubDetails(club)}
 * />
 * ```
 */
export const ClubsTable: React.FC<ClubsTableProps> = ({
  clubs,
  districtId,
  isLoading = false,
  onClubClick,
  clubLinkState,
  initialSortField,
  initialSortDirection,
  onSortChange,
  initialFilterState,
  onFilterChange,
  initialPresetActive,
  onPresetChange,
  referenceDate,
  snapshotDiff,
  programYear,
  openGroups,
  onOpenGroupsChange,
  compactToolbarTarget,
}) => {
  const [sortField, setSortField] = useState<SortField>(
    initialSortField ?? 'name'
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initialSortDirection ?? 'asc'
  )
  // The dedicated Filters drawer (#816). Replaces the hidden per-column header
  // filter dropdowns with one discoverable, instant-apply panel.
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  // Return focus to the trigger when the drawer closes (WCAG 2.4.3) — a modal
  // dialog must restore focus to the control that opened it.
  const filtersTriggerRef = useRef<HTMLButtonElement>(null)
  const closeFilters = useCallback(() => {
    setIsFiltersOpen(false)
    filtersTriggerRef.current?.focus()
  }, [])
  // Collapse the table to cards at the 768px tablet boundary (ADR-006 §2, epic
  // #813 Sprint 4, #812). The card view is for TRUE mobile only (< 768px);
  // 768–1279px shows the table with low-priority columns hidden (the
  // priority-column model below), and ≥1280px shows the full set. Clubs are
  // browsed one-at-a-time, so card-collapse at true mobile is the right pattern
  // (lesson 105) — but the old 640px value made the table→card swap a cliff
  // with no tablet tier. The tablet tier is what #812 adds.
  const isPhoneWidth = useIsMobile(768)
  // A phone on its side (#1912): with the context bar's toolbar slot the
  // table takes the phone layout too — rows + Filter & sort sheet, search
  // and trigger in the sticky bar, total + exports below the rows — so the
  // first row starts by 200px at 812×375 (it was 483px).
  const isShortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY)
  const compactToolbar =
    isShortLandscape && compactToolbarTarget ? compactToolbarTarget : null
  const isMobile = isPhoneWidth || compactToolbar !== null

  // Use column filters hook with optional URL-initialized state (#272)
  const {
    filteredClubs,
    filterState,
    setFilter: setFilterInternal,
    clearAllFilters: clearAllFiltersInternal,
    getFilter,
    hasActiveFilters,
    activeFilterCount,
  } = useColumnFilters(clubs, initialFilterState, referenceDate, programYear)

  // Wrap setFilter to notify parent of changes for URL sync
  const setFilter = useCallback(
    (
      field: SortField,
      filter: import('./filters/types').ColumnFilter | null
    ) => {
      setFilterInternal(field, filter)
      // Notify after state update via microtask
      if (onFilterChange) {
        const next = { ...filterState, [field]: filter }
        if (!filter) delete next[field]
        onFilterChange(next)
      }
    },
    [setFilterInternal, onFilterChange, filterState]
  )

  const clearAllFilters = useCallback(() => {
    clearAllFiltersInternal()
    onFilterChange?.({})
  }, [clearAllFiltersInternal, onFilterChange])

  // Visible-search → `name` text filter (#814). Empty/whitespace clears the
  // filter rather than writing `?search=` junk to the URL.
  const handleSearchChange = useCallback(
    (raw: string) => {
      setFilter(
        'name',
        raw.trim()
          ? { field: 'name', type: 'text', value: raw, operator: 'contains' }
          : null
      )
    },
    [setFilter]
  )

  // Get row background color based on status
  const getRowColor = (
    status: 'thriving' | 'vulnerable' | 'intervention-required'
  ) => {
    switch (status) {
      case 'intervention-required':
        return 'bg-red-50 hover:bg-red-100'
      case 'vulnerable':
        return 'bg-yellow-50 hover:bg-yellow-100'
      default:
        // Default (non-status) row — token-driven surface + hover (#668).
        // Status rows above keep their semantic red/yellow bg (Sprint 3 #669).
        return 'clubs-table-row'
    }
  }

  // TanStack Table owns sort / sizing / pinning / visibility (#835, epic #821
  // Sprint 1). The filter pipeline (useColumnFilters → filteredClubs) and its
  // metadata (COLUMN_CONFIGS) are unchanged (R11) — the table presents over it.
  //
  // Feed the table a name-ascending base order so its STABLE sort reproduces the
  // pre-migration "secondary sort by club name (always ascending)" tiebreak in
  // both directions (see clubsColumns.tsx). Memoized on filteredClubs.
  // "Close to Distinguished" preset (#903) — a new pipeline step (R11) layered
  // on the column filters, powered by the ONE shared canonical predicate so it
  // can never diverge from the club-detail-card banner.
  // Seeded from the URL (#979) via initialPresetActive; toggling notifies the
  // owning page through onPresetChange, which writes `?preset=`. Local state is
  // the live source of truth for the render (mirrors the sort/dir seam) — the
  // page never pushes the value back in, so there is no inward-sync race.
  const [presetActive, setPresetActive] = useState(initialPresetActive ?? false)
  const handlePresetToggle = useCallback(() => {
    setPresetActive(prev => {
      const next = !prev
      onPresetChange?.(next)
      return next
    })
  }, [onPresetChange])
  const presetFilteredClubs = useMemo(() => {
    if (!presetActive) return filteredClubs
    return filteredClubs.filter(club =>
      isCloseToDistinguished({
        projection: calculateClubProjection(club, programYear),
        cspSubmitted: club.cspSubmitted,
      })
    )
  }, [filteredClubs, presetActive, programYear])

  // ── Phone Filter & sort sheet (#1836) ─────────────────────────────────
  // Below 768 the column-filter drawer becomes the shared FilterSheet with
  // facet chips. The search is its own sticky field, so the sheet's count and
  // "Clear all" leave the `name` filter alone. Same filter state, another entry
  // point (R11); every change still leaves through onFilterChange (URL).
  const nameFilter = filterState['name'] ?? null
  // The preset is a sheet chip too, so it counts and clears with the rest.
  const sheetActiveCount =
    activeFilterCount - (nameFilter ? 1 : 0) + (presetActive ? 1 : 0)
  const clearSheetFilters = useCallback(() => {
    clearAllFiltersInternal()
    if (nameFilter) setFilterInternal('name', nameFilter)
    onFilterChange?.(nameFilter ? { name: nameFilter } : {})
    if (presetActive) handlePresetToggle()
  }, [
    clearAllFiltersInternal,
    setFilterInternal,
    nameFilter,
    onFilterChange,
    presetActive,
    handlePresetToggle,
  ])

  const sheetFacets = useMemo((): FilterSheetFacet[] => {
    const selectedOf = (field: SortField): string[] => {
      const f = filterState[field]
      return f?.type === 'categorical' && Array.isArray(f.value)
        ? (f.value as string[])
        : []
    }
    const setFacet = (field: SortField) => (next: string[]) =>
      setFilter(
        field,
        next.length
          ? { field, type: 'categorical', value: next, operator: 'in' }
          : null
      )
    const byNatural = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true })
    const options = (values: string[], prefix: RegExp) =>
      [...new Set(values)]
        .filter(Boolean)
        .sort(byNatural)
        .map(v => ({ value: v, label: v.replace(prefix, '') }))

    const divisions = selectedOf('division')
    const areaSource = divisions.length
      ? clubs.filter(c => divisions.includes(c.divisionName))
      : clubs
    return [
      {
        // The "Close to Distinguished" preset (#903) is its own pipeline step
        // with its own URL key (?preset=), not a column filter (R11).
        id: 'preset',
        label: 'Quick filter',
        options: [
          {
            value: PRESET_CLOSE_TO_DISTINGUISHED,
            label: '🎯 Close to Distinguished',
          },
        ],
        selected: presetActive ? [PRESET_CLOSE_TO_DISTINGUISHED] : [],
        onChange: next => {
          if (next.length > 0 !== presetActive) handlePresetToggle()
        },
      },
      {
        id: 'status',
        label: 'Status',
        options: [
          { value: 'thriving', label: 'Thriving' },
          { value: 'vulnerable', label: 'Vulnerable' },
          { value: 'intervention-required', label: 'Intervention required' },
        ],
        selected: selectedOf('status'),
        onChange: setFacet('status'),
      },
      {
        id: 'division',
        label: 'Division',
        options: options(
          clubs.map(c => c.divisionName),
          /^Division\s+/i
        ),
        selected: divisions,
        onChange: setFacet('division'),
      },
      {
        id: 'area',
        label: 'Area',
        options: options(
          areaSource.map(c => c.areaName),
          /^Area\s+/i
        ),
        selected: selectedOf('area'),
        onChange: setFacet('area'),
      },
    ]
  }, [clubs, filterState, setFilter, presetActive, handlePresetToggle])

  const nameSortedClubs = useMemo(
    () =>
      [...presetFilteredClubs].sort((a, b) =>
        a.clubName.toLowerCase().localeCompare(b.clubName.toLowerCase())
      ),
    [presetFilteredClubs]
  )

  // Sort state is CONTROLLED by sortField/sortDirection — the URL-synced source
  // of truth that ColumnHeader drives via handleSort. The table derives the row
  // order from it; nothing calls the table's own sort API, so no onSortingChange.
  const sorting: SortingState = useMemo(
    () => [{ id: sortField, desc: sortDirection === 'desc' }],
    [sortField, sortDirection]
  )

  // The sticky key column ('name') is the start-pinned column (ADR-006 §3,
  // Lesson 105); the existing CSS (.clubs-table__sticky-col) renders the
  // stickiness, the pinning state is the model of record.
  //
  // v9 renamed the physical `left`/`right` regions to the logical `start`/`end`
  // (#1530) with no deprecated aliases — a `{ left: [...] }` object typechecks
  // as neither, and silently unpins the column if it slipped through. The CSS
  // is unaffected: this app is LTR-only and .clubs-table__sticky-col does the
  // sticky positioning itself.
  const columnPinning: ColumnPinningState = useMemo(
    () => ({ start: [STICKY_COLUMN_FIELD], end: [] }),
    []
  )

  // Column-group show/hide (#819, ADR-006 §4). Persisted to localStorage so the
  // selection survives reload. Group visibility is a durable per-user VIEW
  // preference (like dark mode), not shareable filter data — keeping it out of
  // the URL avoids the filter↔URL reconcile race surface (lessons 070/130).
  // The hidden set is the source of truth (default empty = all visible, so the
  // table is unchanged until the user opts in). Drives TanStack's native
  // `columnVisibility` state — no parallel responsive logic, no hand-rolled
  // filter on the body (TanStack's row.getVisibleCells keeps header/body in
  // lockstep automatically). The sticky 'name' column is forced visible so
  // hiding the Identity group can't strip the row's own label (ADR-006 §3).
  const [storedHiddenGroups, setStoredHiddenGroups] = usePersistedState<
    ColumnGroup[]
  >(HIDDEN_GROUPS_STORAGE_NAME, [])
  // Opt-in show for the Changes group (#795). Stored as a boolean (default
  // false) so the Changes columns stay hidden until the user toggles them on,
  // independently of the hide-on-toggle behaviour the other groups use. The
  // pre-existing `hiddenGroups` store can be `[]` for users who saved it before
  // 'changes' existed — without a separate flag, they'd be opted IN by default.
  const [changesVisible, setChangesVisible] = usePersistedState<boolean>(
    CHANGES_VISIBLE_STORAGE_NAME,
    false
  )
  const hiddenGroups = useMemo(() => {
    const s = new Set(sanitizeHiddenGroups(storedHiddenGroups))
    if (!changesVisible) s.add('changes')
    return s
  }, [storedHiddenGroups, changesVisible])
  const isGroupHidden = useCallback(
    (group: ColumnGroup) => hiddenGroups.has(group),
    [hiddenGroups]
  )
  const toggleGroup = useCallback(
    (group: ColumnGroup) => {
      if (group === 'changes') {
        setChangesVisible(v => !v)
        return
      }
      setStoredHiddenGroups(prev => {
        const next = new Set(sanitizeHiddenGroups(prev))
        if (next.has(group)) next.delete(group)
        else next.add(group)
        return [...next]
      })
    },
    [setStoredHiddenGroups, setChangesVisible]
  )

  // The 'changes' group is offered ONLY when a snapshot diff is provided —
  // toggling a column set with nothing in it would be a dead control. The other
  // groups are offered when at least one column claims them (so 'identity',
  // 'membership', 'renewals', 'recognition' are always offered today; this
  // shape is forward-compatible if any of them ever empties out).
  const availableColumnGroups = useMemo(
    () =>
      COLUMN_GROUPS.filter(
        g =>
          (g.id === 'changes' && !!snapshotDiff) ||
          (g.id !== 'changes' && COLUMN_CONFIGS.some(c => c.group === g.id))
      ),
    [snapshotDiff]
  )

  // ClubDiff lookup keyed by clubId, recomputed only when the diff changes.
  // The delta column defs close over this Map so each cell can render its
  // row's own diff without re-walking `snapshotDiff.clubs.bothPresent`.
  const clubDiffsById = useMemo(() => {
    const m = new Map<
      string,
      import('@taverns-red/shared-contracts').ClubDiff
    >()
    if (snapshotDiff) {
      for (const c of snapshotDiff.clubs.bothPresent) m.set(c.clubId, c)
    }
    return m
  }, [snapshotDiff])

  // Delta column defs (#795). Only appended when a diff is provided — absent ⇒
  // the table is byte-identical to its pre-#795 self. The 'changes' group's
  // visibility is driven by `hiddenGroups` (opt-in, default hidden).
  const tableColumns = useMemo(
    () =>
      snapshotDiff
        ? [...clubsColumns, ...buildClubsDeltaColumns(clubDiffsById)]
        : clubsColumns,
    [snapshotDiff, clubDiffsById]
  )

  const columnVisibility = useMemo<ColumnVisibilityState>(() => {
    const vis: ColumnVisibilityState = {}
    for (const c of COLUMN_CONFIGS) {
      // The sticky key column is the row's label — never hidden by a group.
      if (c.field === STICKY_COLUMN_FIELD) continue
      if (hiddenGroups.has(c.group)) vis[c.field] = false
    }
    // Delta columns belong to the 'changes' group; hide the whole set when the
    // group is hidden. They live outside COLUMN_CONFIGS (they're display-only
    // columns, no filter or sort metadata to register) so the loop above
    // doesn't reach them.
    if (hiddenGroups.has('changes')) {
      for (const id of CLUBS_DELTA_COLUMN_IDS) vis[id] = false
    }
    return vis
  }, [hiddenGroups])

  // CC-7 (#872): build the club-detail href once; the sticky name cell renders
  // it as a real <Link> (via table.meta), and the phone rows (#1833) reuse it.
  const clubLinkTo = useCallback(
    (club: ProcessedClubTrend) => `/district/${districtId}/club/${club.clubId}`,
    [districtId]
  )

  // v9 (#1530): `useReactTable` → `useTable`, and the row models moved from
  // table options into the `features` object (clubsTableFeatures.ts). The core
  // row model is automatic now, so `getCoreRowModel()` is gone entirely; the
  // sorted row model, the pinning slice and the visibility slice only exist
  // because their features are registered there.
  const table = useTable<ClubsTableFeatures, ProcessedClubTrend>({
    features: clubsTableFeatures,
    data: nameSortedClubs,
    columns: tableColumns,
    state: { sorting, columnPinning, columnVisibility },
    meta: { clubLinkTo, clubLinkState },
    // Every slice above is fully controlled by this component's own state —
    // TanStack never writes them back, so the on*Change callbacks are
    // intentionally omitted (R11 — drive the existing state, don't add a
    // parallel one). v9 syncs an external `state` value into the internal base
    // atom on each render, so a controlled slice with no callback is frozen
    // from the table's side and driven entirely from ours, exactly as in v8.
    enableSortingRemoval: false,
  })

  const rowModel = table.getRowModel()
  // The ordered ProcessedClubTrend[] backing CSV export, the count line, the
  // card view, and the scroll-cue effect — mirrors the displayed row order.
  const sortedClubs = useMemo(
    () => rowModel.rows.map(r => r.original),
    [rowModel]
  )

  // ── Phone rows (#1833) ────────────────────────────────────────────────
  // Below 768 the ClubCard stack became MobileRowList compact rows. The DEFAULT
  // view (no search / filter / preset, default name sort) groups by division,
  // collapsed, with counts — the browse view. Anything the user narrows or
  // re-orders becomes one flat result list in `sortedClubs` order, so search
  // and sort keep meaning what they say. Both views read the existing pipeline
  // output (R11); nothing here filters or sorts on its own.
  const isDefaultMobileView =
    !hasActiveFilters &&
    !presetActive &&
    sortField === 'name' &&
    sortDirection === 'asc'

  const toMobileRow = useCallback(
    (club: ProcessedClubTrend): MobileRow => {
      const members = club.latestMembership
      const net = formatNet(club)
      const memberText = `${members} member${members === 1 ? '' : 's'}`
      const coached = club.coach?.status === 'active'
      return {
        id: club.clubId,
        to: clubLinkTo(club),
        state: clubLinkState,
        title: club.clubName,
        chip: (
          <StatusChip
            status={club.currentStatus}
            label={getClubHealthStatusShortLabel(club.currentStatus)}
          />
        ),
        // Line 2 keeps the chip and DCP; the member count rides under the
        // trend sparkline with its net (#1792) — measured at 375, the count
        // beside a 60 px trend ellipsized every row by up to 60 px.
        meta: `${club.latestDcpGoals}/10 DCP`,
        // Coach flag (#1968): line 2 has no room at 375 ("· Coach" clipped to
        // "· C…", #1954), so an active coach rides line 1 after the name,
        // which ellipsizes first. Completed engagements stay desktop-only.
        badge: coached ? 'Coach' : undefined,
        // The row's trend (#1792): the same 60×16 sparkline as the desktop
        // Trend column, then "members (net)". The link's accessible name
        // already says all of it, so the visual pair is hidden from AT.
        trailing: (
          <span className="clubs-row-trend" aria-hidden="true">
            <ClubTrendSparkline club={club} />
            <span className="clubs-row-trend__net tabular-nums">
              {net ? `${members} (${net})` : members}
            </span>
          </span>
        ),
        ariaLabel: `${club.clubName} — ${getClubHealthStatusLabel(
          club.currentStatus
        )}${coached ? ', active coach' : ''}, ${memberText}${net ? `, net ${net}` : ''}, ${
          club.latestDcpGoals
        } of 10 DCP goals`,
      }
    },
    [clubLinkTo, clubLinkState]
  )

  const mobileRows = useMemo(
    () =>
      isMobile && !isDefaultMobileView ? sortedClubs.map(toMobileRow) : [],
    [isMobile, isDefaultMobileView, sortedClubs, toMobileRow]
  )

  const mobileGroups = useMemo<MobileRowGroup[] | undefined>(() => {
    if (!isMobile || !isDefaultMobileView) return undefined
    const byDivision = new Map<
      string,
      { label: string; rows: MobileRow[]; x: number; v: number }
    >()
    for (const club of sortedClubs) {
      const id = club.divisionId || 'none'
      let g = byDivision.get(id)
      if (!g) {
        g = { label: club.divisionName || 'No division', rows: [], x: 0, v: 0 }
        byDivision.set(id, g)
      }
      g.rows.push(toMobileRow(club))
      if (club.currentStatus === 'intervention-required') g.x++
      else if (club.currentStatus === 'vulnerable') g.v++
    }
    return [...byDivision.entries()]
      .sort(([, a], [, b]) =>
        a.label.localeCompare(b.label, undefined, { numeric: true })
      )
      .map(([id, g]) => {
        const summary = [g.x ? `\u2717 ${g.x}` : '', g.v ? `\u26a0 ${g.v}` : '']
          .filter(Boolean)
          .join(' \u00b7 ')
        return {
          id,
          label: g.label,
          rows: g.rows,
          ...(summary ? { summary } : {}),
        }
      })
  }, [isMobile, isDefaultMobileView, sortedClubs, toMobileRow])

  const [localOpenGroups, setLocalOpenGroups] = useState<string[]>([])
  const openGroupIds = openGroups ?? localOpenGroups
  const handleToggleGroup = useCallback(
    (id: string) => {
      const next = openGroupIds.includes(id)
        ? openGroupIds.filter(g => g !== id)
        : [...openGroupIds, id]
      if (onOpenGroupsChange) onOpenGroupsChange(next)
      else setLocalOpenGroups(next)
    },
    [openGroupIds, onOpenGroupsChange]
  )

  const searchValue =
    typeof getFilter('name')?.value === 'string'
      ? (getFilter('name')!.value as string)
      : ''

  // No pagination (#667): the full sorted+filtered set renders in a single
  // sticky-header scroll container. Sort / filter / search span every row;
  // the "Showing N of M clubs" count line is the only progress indicator.

  // Handle sort
  const handleSort = (field: SortField) => {
    let newField = sortField
    let newDirection: SortDirection
    if (sortField === field) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      setSortDirection(newDirection)
    } else {
      newField = field
      newDirection = 'asc'
      setSortField(newField)
      setSortDirection(newDirection)
    }
    onSortChange?.(newField, newDirection)
  }

  // The sheet sets field and direction together — one URL write (#1836).
  const setSort = (field: string, direction: SortDirection) => {
    setSortField(field as SortField)
    setSortDirection(direction)
    onSortChange?.(field as SortField, direction)
  }

  // Show the right-edge scroll-cue ONLY when the table actually overflows to
  // the right. A permanent fade would wash out the right-aligned numeric
  // columns on a wide desktop where the full set fits and nothing scrolls — a
  // false affordance. Toggled imperatively via a data-attr on the scroll-wrap
  // (gated in CSS) so scroll/resize don't re-render the whole table. Mirrors
  // the landing rankings table (#811).
  const tableScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const update = () => {
      const moreToRight = el.scrollWidth - el.clientWidth - el.scrollLeft > 1
      el.parentElement?.setAttribute(
        'data-scrollable-right',
        String(moreToRight)
      )
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [sortedClubs, isMobile])

  // Discoverable entry to the Filters drawer (#816) / phone Filter & sort
  // sheet (#1836). One button, placed by viewport: in the toolbar from 768
  // up, in the sticky search row below it, so the phone toolbar is one row.
  const filtersTrigger = (
    <button
      ref={filtersTriggerRef}
      type="button"
      className="clubs-filters-trigger"
      onClick={() => setIsFiltersOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={isFiltersOpen}
      {...(isMobile
        ? {
            'aria-label':
              sheetActiveCount > 0
                ? `Filter & sort, ${sheetActiveCount} active`
                : 'Filter & sort',
          }
        : {})}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
        />
      </svg>
      {/* "Filter" fits beside the search at 375; the accessible name
          (aria-label) is the full "Filter & sort" and contains it. */}
      <span>{isMobile ? 'Filter' : 'Filters'}</span>
      {(isMobile ? sheetActiveCount : activeFilterCount) > 0 && (
        <span className="clubs-filters-trigger__badge">
          {isMobile ? sheetActiveCount : activeFilterCount}
        </span>
      )}
    </button>
  )

  const exportGroup = (
    <div className="clubs-export-group">
      <ExportButton
        onExport={() =>
          exportClubPerformance(
            sortedClubs.map(club => ({
              clubId: club.clubId,
              clubName: club.clubName,
              divisionName: club.divisionName,
              areaName: club.areaName,
              membershipTrend: club.membershipTrend,
              dcpGoalsTrend: club.dcpGoalsTrend,
              currentStatus: club.currentStatus,
              distinguishedLevel: club.distinguishedLevel,
              riskFactors: club.riskFactors,
              octoberRenewals: club.octoberRenewals,
              aprilRenewals: club.aprilRenewals,
              newMembers: club.newMembers,
              clubStatus: club.clubStatus,
              coach: club.coach,
            })),
            districtId
          )
        }
        label="Export Clubs"
        disabled={sortedClubs.length === 0}
      />
      {/* Diff CSV export (#795). A SIBLING of the clubs export — the diff
          rows are from/to/Δ across two snapshots, not current-snapshot
          fields, so a single combined CSV would conflate two datasets
          (lesson 117). Shown only when a snapshot diff is loaded. */}
      {snapshotDiff && (
        <ExportButton
          onExport={() => exportSnapshotDiff(snapshotDiff)}
          label="Export Changes"
          disabled={
            snapshotDiff.clubs.bothPresent.length === 0 &&
            snapshotDiff.clubs.onlyInFrom.length === 0 &&
            snapshotDiff.clubs.onlyInTo.length === 0
          }
        />
      )}
    </div>
  )

  const resultCount = (
    <div>
      {sortedClubs.length === clubs.length ? (
        <>Total: {clubs.length} clubs</>
      ) : (
        <>
          Showing {sortedClubs.length} of {clubs.length} clubs
        </>
      )}
    </div>
  )

  return (
    <div className="redesign-panel">
      {/* Header with Export and Results Count. In short landscape (#1912)
          the title stays as a visually hidden heading; the total and the
          exports move below the rows (the compact footer). */}
      {compactToolbar ? (
        <h3 className="sr-only">All Clubs</h3>
      ) : (
        <div className="p-6 clubs-panel-header">
          {/* On phones the row wraps: the title keeps its own line and the
            exports sit below it (#2343), instead of squeezing the title to
            "All / Clubs" beside two stacked buttons. */}
          <div className="flex items-center justify-between mb-4 clubs-panel-header__row">
            <h3 className="text-xl font-bold clubs-panel-title">All Clubs</h3>
            {exportGroup}
          </div>

          {/* Visible name search (#814, epic #818 Sprint 1). Recognition over
            recall: a prominent box at the top of the table replaces the search
            that was buried in the hidden "Club" column-header dropdown. A
            second UI entry point onto the EXISTING `name` text filter (R11), so
            it stays in sync with that dropdown and URL-syncs through the parent
            (DistrictClubsPage maps `name` ⇄ `?search=`). */}
          {/* Below 768 the search and the trigger live in the sticky row above
            the rows (#1833, #1836) and the preset lives in the sheet, so the
            toolbar row would be empty there. */}
          {!isMobile && (
            <div className="clubs-filter-toolbar">
              <ClubSearchBox
                value={searchValue}
                onSearchChange={handleSearchChange}
              />
              {filtersTrigger}
              {/* Column-group show/hide (#819, ADR-006 §4). Same toolbar slot as
              the Filters trigger so the two table-shape controls live together;
              uses the same .clubs-filters-trigger styling for a single visual
              language. */}
              {/* Column groups shape the table; the phone rows have no columns
              (#1833), so the control would be dead there. */}
              <ColumnGroupsMenu
                groups={availableColumnGroups}
                isGroupHidden={isGroupHidden}
                onToggle={toggleGroup}
              />
              {/* Close-to-Distinguished preset (#903) — moved into the toolbar
              cluster, directly after Columns (#967). One action-oriented toggle
              in place of the retired quick-filter row, sharing the canonical
              predicate with the club-detail banner. It carries the shared
              .clubs-filters-trigger treatment so it reads as one toolbar
              language; .clubs-preset-chip adds only the pressed-state amber. */}
              <button
                type="button"
                className="clubs-filters-trigger clubs-preset-chip"
                aria-pressed={presetActive}
                onClick={handlePresetToggle}
              >
                🎯 Close to Distinguished
              </button>
            </div>
          )}

          {/* Preset feedback line — distinct from the table's "Showing N of M"
            summary, and a polite live region for the toggle. Sits below the
            single toolbar row rather than in its own control row (#967). */}
          {presetActive && (
            <p className="clubs-preset-count" aria-live="polite">
              {presetFilteredClubs.length} of {filteredClubs.length} clubs need
              a nudge to Distinguished
            </p>
          )}

          {/* Results Count and Quick Filters */}
          <div className="flex flex-wrap items-center gap-4 text-sm clubs-text-muted">
            {resultCount}
          </div>
        </div>
      )}

      {/* Active-filters summary bar (#817). Visible, removable summary of the
          full filter set — including drawer-only filters the preset chips
          don't surface. Same filter state, another entry point (R11). */}
      <div className="px-6">
        <ActiveFiltersBar
          filterState={filterState}
          setFilter={setFilter}
          clearAllFilters={clearAllFilters}
        />
      </div>

      {/* Phone search (#1833): sticky directly above the list. Its parent is
          the whole panel, so it pins while the rows scroll and stays put
          (with the no-results state below it) when a search matches nothing. */}
      {/* Short landscape (#1912): the same row lives in the context bar's
          toolbar slot instead, which is already sticky, so it costs the first
          screen no height. A portal keeps it in this component's state. */}
      {isMobile &&
        !isLoading &&
        clubs.length > 0 &&
        (compactToolbar ? (
          createPortal(
            <div className="clubs-compact-toolbar">
              <ClubSearchBox
                value={searchValue}
                onSearchChange={handleSearchChange}
                placeholder="Search clubs"
              />
              {filtersTrigger}
            </div>,
            compactToolbar
          )
        ) : (
          <div className="clubs-mobile-sticky-search">
            <ClubSearchBox
              value={searchValue}
              onSearchChange={handleSearchChange}
              placeholder="Search clubs"
            />
            {filtersTrigger}
          </div>
        ))}

      {/* Loading State */}
      {isLoading && <LoadingSkeleton variant="table" count={5} />}

      {/* No Results — no data at all. Token-driven inline markup mirroring
          the filter-empty state below (#672), so the clubs table is gray-free
          in every state it renders. Distinct copy from the filter-empty case:
          this is "nothing cached yet", not "your filters excluded everything". */}
      {!isLoading && sortedClubs.length === 0 && clubs.length === 0 && (
        <div className="p-12 text-center" role="status">
          <svg
            className="w-16 h-16 clubs-text-muted mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="clubs-text-muted font-medium">No Clubs Found</p>
          <p className="clubs-text-muted text-sm mt-1 max-w-lg mx-auto">
            No club data is available for this district. This may be because no
            data has been cached yet.
          </p>
        </div>
      )}

      {/* No Search Results */}
      {!isLoading && sortedClubs.length === 0 && clubs.length > 0 && (
        <div className="p-12 text-center">
          <svg
            className="w-16 h-16 clubs-text-muted mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="clubs-text-muted font-medium">
            No clubs match your filters
          </p>
          {/* Name the filters doing the excluding (#817) — a dead "adjust your
              filters" leaves the user guessing which one to loosen. */}
          {describeActiveFilters(filterState).length > 0 && (
            <p className="clubs-text-muted text-sm mt-1">
              Active:{' '}
              {describeActiveFilters(filterState)
                .map(d => `${d.label} ${d.value}`)
                .join(' · ')}
            </p>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="clubs-clear-filters-btn mt-4 mx-auto"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Phone rows (#1833) — replaces the #217 ClubCard stack. */}
      {!isLoading && sortedClubs.length > 0 && isMobile && (
        // Bleed the rows to the panel edge (its 18 px padding) at < 768.
        <div className="pb-4 clubs-mobile-rows">
          {/* Sort lives in the Filter & sort sheet (#1836). Long names wrap to
              two lines rather than ellipsize (#2335, #2329's wrapTitle). */}
          {mobileGroups ? (
            <MobileRowList
              label="Clubs by division"
              noun="clubs"
              groups={mobileGroups}
              chipPlacement="meta"
              flush
              wrapTitle
              openGroupIds={openGroupIds}
              onToggleGroup={handleToggleGroup}
            />
          ) : (
            <MobileRowList
              label="Clubs"
              noun="clubs"
              rows={mobileRows}
              chipPlacement="meta"
              flush
              wrapTitle
            />
          )}
        </div>
      )}

      {/* Compact footer (#1912): the header's total, preset feedback and
          CSV exports, below the rows so the first row leads the screen. */}
      {compactToolbar && !isLoading && clubs.length > 0 && (
        <div className="clubs-panel-footer">
          <div className="clubs-panel-footer__count text-sm clubs-text-muted">
            {resultCount}
            {presetActive && (
              <p className="clubs-preset-count" aria-live="polite">
                {presetFilteredClubs.length} of {filteredClubs.length} clubs
                need a nudge to Distinguished
              </p>
            )}
          </div>
          {exportGroup}
        </div>
      )}

      {/* Desktop Table — all clubs in one capped-height scroll container
          with a sticky header (#667). The container is keyboard-operable
          (role/tabindex/aria-label) so keyboard-only users can scroll it
          (WCAG 2.1.1; axe scrollable-region-focusable). */}
      {!isLoading && sortedClubs.length > 0 && !isMobile && (
        <div className="clubs-table__scroll-wrap">
          <div
            ref={tableScrollRef}
            className="clubs-table-scroll overflow-x-auto"
            role="region"
            aria-label="All clubs table"
            tabIndex={0}
          >
            <table id="clubs-table" className="w-full table-auto">
              <thead className="clubs-table-sticky-head">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => {
                      const isSortable = header.column.getCanSort()
                      const isActiveSort = sortField === header.column.id
                      const ariaSort: React.AriaAttributes['aria-sort'] =
                        !isSortable
                          ? undefined
                          : isActiveSort
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={ariaSort}
                          className={`p-0 ${clubColumnPriorityClass(header.column.id)}`.trim()}
                        >
                          <ColumnHeader
                            field={header.column.id as SortField}
                            label={header.column.columnDef.header as string}
                            sortable={isSortable}
                            currentSort={{
                              field: sortField,
                              direction: sortDirection,
                            }}
                            onSort={handleSort}
                          />
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rowModel.rows.map(row => {
                  const club = row.original
                  const tint = rowTint(club.currentStatus)
                  return (
                    <tr
                      key={club.clubId}
                      onClick={() => onClubClick?.(club)}
                      className={`${getRowColor(club.currentStatus)} cursor-pointer transition-colors`}
                    >
                      {/* Cells render in the column-model order (clubsColumns.tsx):
                      Club, Div, Area, Status, Members, Needed, New, Oct Renew,
                      Apr Renew, DCP, Tier, Club Status, Years. Each td's class
                      (base + responsive priority) comes from clubColumnTdClass;
                      only the sticky key column ('name') carries data-row-tint so
                      the CSS repaints it opaque to the row status bg (Lesson 105). */}
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          className={clubColumnTdClass(cell.column.id)}
                          data-row-tint={
                            cell.column.id === 'name' ? tint : undefined
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Right-edge fade cue: "there's more →". Shown only when the table
              overflows right (data-scrollable-right, set by the effect above);
              pointer-events:none so it never blocks taps/scroll (#812). */}
          <div className="clubs-table__scroll-cue" aria-hidden="true" />
        </div>
      )}

      {/* Dedicated Filters drawer (#816). Instant-apply over the SAME filter
          state the search box and ActiveFiltersBar write to (R11) — one
          mechanism, multiple entry points. (The quick-filter chip row that
          was a third entry point was removed in #902.) */}
      {isMobile ? (
        <FilterSheet
          isOpen={isFiltersOpen}
          onClose={closeFilters}
          resultCount={sortedClubs.length}
          resultNoun={{ one: 'club', other: 'clubs' }}
          activeCount={sheetActiveCount}
          onClearAll={clearSheetFilters}
          sort={{
            options: COLUMN_CONFIGS.filter(c => c.sortable).map(c => ({
              value: c.field,
              label: c.sortLabel ?? c.label,
            })),
            field: sortField,
            direction: sortDirection,
            onChange: setSort,
          }}
          facets={sheetFacets}
        />
      ) : (
        <FiltersPanel
          isOpen={isFiltersOpen}
          onClose={closeFilters}
          getFilter={getFilter}
          setFilter={setFilter}
          clearAllFilters={clearAllFilters}
          activeFilterCount={activeFilterCount}
        />
      )}
    </div>
  )
}
