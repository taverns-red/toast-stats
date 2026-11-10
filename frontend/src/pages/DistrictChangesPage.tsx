import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import {
  useSnapshotDiff,
  type SnapshotDiffView,
} from '../hooks/useSnapshotDiff'
import { useUrlDatePair } from '../hooks/useUrlDatePair'
import { useUrlStringSet } from '../hooks/useUrlStringSet'
import { useUrlState } from '../hooks/useUrlState'
import { useTransferCounterparts } from '../hooks/useTransferCounterparts'
import { useDistrictRanking } from '../hooks/useDistrictRanking'
import { useDistinguishedCountsAt } from '../hooks/useDistinguishedCountsAt'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ContextBar } from '../components/ContextBar'
import { DatePairPicker } from '../components/DatePairPicker'
import { DatePairPresetChips } from '../components/DatePairPresetChips'
import { KpiDeltaCard } from '../components/KpiDeltaCard'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'
import { ChangeGroup } from '../components/ChangeGroup'
import { ExportButton } from '../components/ExportButton'
import { exportSnapshotDiff } from '../utils/csvExport'
import type {
  DiffEvent,
  DiffEventCategory,
} from '@taverns-red/shared-contracts'
import { DISTRICT_SECTIONS } from '../config/districtSections'
import { clubNameInDiff, narrowDiffToClub } from '../utils/changesClubFilter'

// One description per section, from the section config (#2161).
const CHANGES_ABOUT = DISTRICT_SECTIONS.find(
  s => s.segment === 'changes'
)?.about

/* District "What Changed" page (#793, epic #797 Sprint 1–2, ADR-005 §1).
   What changed between two recorded snapshot dates. The from/to pair is owned
   here via useUrlDatePair (URL-synced, #794) and passed to useSnapshotDiff as
   props (R3); empty params fall back to the Phase-1 default (previous → latest).
   from === to is an explicit "pick two different dates" case (R17). */

/** Human-friendly date, e.g. "May 25, 2026". Date-only, UTC-safe. */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "12 clubs" / "1 club" — the count is the point, so it leads. */
/** Signed count with a U+2212 minus, matching KpiDeltaCard's headline. */
function signed(n: number): string {
  const m = Math.abs(n).toLocaleString()
  return n > 0 ? `+${m}` : n < 0 ? `−${m}` : '0'
}

/** "Low 5 (+1)" — end count, plus the change only when non-zero (#2425). */
function countLine(label: string, c: { to: number; delta: number }): string {
  const base = `${label} ${c.to.toLocaleString()}`
  return c.delta === 0 ? base : `${base} (${signed(c.delta)})`
}

/**
 * Props for the "Active clubs" tile (#2425, Ron's decisions): headline is the
 * signed change in TI status Active, then Low / Ineligible / Suspended and the
 * full total. Counts come from `clubStatusTotals`, computed from the same
 * status field as the Club status changes group (#1247, R3). A snapshot with
 * no status data renders a dash and says so — never a silent 0.
 */
function activeClubsTile(diff: SnapshotDiffView): {
  current: number | null
  secondaryLabel: string
  subLines: string[]
} {
  const t = diff.clubStatusTotals
  if (!t || t.statusMissingFrom || t.statusMissingTo) {
    const all = t?.all ?? diff.totals.clubCount
    const missingDates = !t
      ? []
      : [
          t.statusMissingFrom ? diff.from.date : null,
          t.statusMissingTo ? diff.to.date : null,
        ].filter((d): d is string => d !== null)
    return {
      current: null,
      secondaryLabel:
        missingDates.length > 0
          ? `Club status not recorded on ${missingDates.map(fmtDate).join(' or ')}`
          : 'Club status not recorded for these dates',
      subLines: [countLine('All clubs', all)],
    }
  }
  const lines: string[] = []
  for (const status of ['Low', 'Ineligible', 'Suspended'] as const) {
    const c = t.byStatus[status]
    if (c.from === 0 && c.to === 0) continue
    lines.push(countLine(status, c))
  }
  if (t.unrecorded.from > 0 || t.unrecorded.to > 0) {
    lines.push(countLine('Status not recorded', t.unrecorded))
  }
  lines.push(countLine('All clubs', t.all))
  const active = t.byStatus.Active
  return {
    current: active.delta,
    secondaryLabel: `${active.from.toLocaleString()} → ${active.to.toLocaleString()}`,
    subLines: lines,
  }
}

/** The rankings read for one end of the pair, as `useDistrictRanking` gives it. */
type RankingRead = ReturnType<typeof useDistrictRanking>
/** The analytics `distinguishedCounts` read for one end of the pair. */
type CountsRead = ReturnType<typeof useDistinguishedCountsAt>

/**
 * Props for the "Distinguished clubs" tile (#2601, Ron 2026-11-09; supersedes
 * the TI-count headline of #2438). Confirmed is the headline everywhere, with
 * provisional beside it and never summed in (#2554):
 *
 *   0                     signed change in CONFIRMED clubs (to - from)
 *   Confirmed 3 → 3
 *   +5 provisional (+2)   provisional at the "to" date; change only if != 0
 *
 * Per date, confirmed is the analytics file's `distinguishedCounts`, falling
 * back to the dated rankings row's `distinguishedClubs` (the #2579 source
 * order). Provisional only exists in `distinguishedCounts`, so a file written
 * before it says "Provisional not recorded". A missing confirmed value on
 * either date renders a dash and says so - never a silent 0.
 */
function distinguishedClubsTile(
  fromRanking: RankingRead,
  toRanking: RankingRead,
  fromCounts: CountsRead,
  toCounts: CountsRead
): { current: number | null; secondaryLabel: string; subLines: string[] } {
  const loading =
    fromRanking.isLoading ||
    toRanking.isLoading ||
    fromCounts.isLoading ||
    toCounts.isLoading
  const from =
    fromCounts.counts?.confirmed ?? fromRanking.ranking?.distinguishedClubs
  const to = toCounts.counts?.confirmed ?? toRanking.ranking?.distinguishedClubs

  let provisional: string
  if (toCounts.counts) {
    const base = `+${toCounts.counts.provisional.toLocaleString()} provisional`
    const delta = fromCounts.counts
      ? toCounts.counts.provisional - fromCounts.counts.provisional
      : 0
    provisional = delta === 0 ? base : `${base} (${signed(delta)})`
  } else {
    provisional = loading ? 'Provisional …' : 'Provisional not recorded'
  }

  if (from === undefined || to === undefined) {
    return {
      current: null,
      secondaryLabel: loading
        ? 'Confirmed clubs …'
        : 'Confirmed clubs not recorded',
      subLines: [provisional],
    }
  }
  return {
    current: to - from,
    secondaryLabel: `Confirmed ${from.toLocaleString()} → ${to.toLocaleString()}`,
    subLines: [provisional],
  }
}

function clubCountPhrase(count: number): string {
  return `${count} ${count === 1 ? 'club' : 'clubs'}`
}

/**
 * The rule-change log entry documenting the 2026 reformation and the two
 * thresholds that decide this notice (#1400 / #1470). The notice asserts the
 * district's boundaries moved; this is where a reader checks how we know.
 */
const REALIGNMENT_METHODOLOGY_HREF =
  '/methodology#py-2026-2027-district-boundaries-redrawn'

/* Display order + headings for the grouped change list. Roster moves first
   (most material), then club / division / area recognition, then the per-club
   metric churn. Club operational-status changes (#1247) sit adjacent to the
   club-added group (a reactivation reads next to "joined", not folded into it).
   Division & area status changes (#1014) sit with the club distinguished group
   as the "recognition" band. */
const CATEGORY_GROUPS: { category: DiffEventCategory; heading: string }[] = [
  { category: 'club-added', heading: 'Clubs that joined' },
  { category: 'club-status', heading: 'Club status changes' },
  { category: 'club-removed', heading: 'Clubs that left' },
  // Realignment transfers (#1443) sit AFTER the genuine roster groups: a real
  // new club stays at the top of the feed instead of being buried among the
  // dozens of clubs a boundary change moved. Both groups render empty-safe
  // (ChangeGroup returns null for an empty list), so an ordinary diff is
  // unaffected by their presence in this list.
  {
    category: 'club-transferred-in',
    heading: 'Clubs moved in (district realignment)',
  },
  {
    category: 'club-transferred-out',
    heading: 'Clubs moved out (district realignment)',
  },
  { category: 'distinguished', heading: 'Distinguished status changes' },
  // Club Success Plan submissions (#1460) join the recognition band: a CSP is
  // a distinguished PREREQUISITE, so it reads next to the club tier changes,
  // ahead of the division/area rollups. Same silent-drop rule as the payments
  // note below — a category not named here never renders.
  { category: 'csp', heading: 'Club Success Plan submissions' },
  { category: 'division-status', heading: 'Division status changes' },
  { category: 'area-status', heading: 'Area status changes' },
  { category: 'membership', heading: 'Membership changes' },
  // Payments (#1459) sits with membership as the other per-club money/people
  // metric — renewal season is read alongside net growth, not after DCP. A
  // category absent from THIS list is dropped silently by the display loop
  // below (no error, no fallback group), so a new engine category is only
  // half-shipped until it is named here.
  { category: 'payments', heading: 'Payment changes' },
  { category: 'dcp-goals', heading: 'DCP goal changes' },
]

const DistrictChangesPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )
  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} — What Changed` : null)

  const { data: cachedDates, isLoading: datesLoading } = useDistrictCachedDates(
    districtId || ''
  )
  const dates = useMemo(() => cachedDates?.dates ?? [], [cachedDates?.dates])
  const { from, to, setFrom, setTo, setPair } = useUrlDatePair(dates)

  // Change-groups are open by default; ?expandChanges lists the categories the
  // user has COLLAPSED (so an all-default page keeps a clean URL). The page owns
  // this state and passes it down (R3) — every entry path (typed URL, share,
  // reload, click) converges here. (#980)
  const [collapsedGroups, setCollapsedGroups] = useUrlStringSet('expandChanges')
  const handleGroupToggle = (category: DiffEventCategory, open: boolean) =>
    setCollapsedGroups(prev =>
      open ? prev.filter(c => c !== category) : [...prev, category]
    )

  // The pair must be two distinct dates with from strictly before to. Each
  // invalid shape gets its own explicit prompt (R17) and skips the fetch —
  // from === to would diff to an all-zero "nothing changed" digest, and
  // from > to would render reversed (negative) deltas under a "what changed"
  // header. Dates are ISO YYYY-MM-DD, so string comparison is chronological.
  const sameDate = !!from && !!to && from === to
  const reversed = !!from && !!to && from > to
  const invalidPair = sameDate || reversed

  const {
    data: diff,
    isLoading: diffLoading,
    isError,
  } = useSnapshotDiff(districtId, from, invalidPair ? undefined : to)

  // ?club= narrows the list to one club's events (#2452) — the club page's
  // Recent changes card links here. One more step in the pipeline (R11):
  // diff → shownDiff (club slice) → eventsByCategory. The KPI tiles keep
  // reading the whole diff, so they stay district-wide.
  const [clubFilter, setClubFilter] = useUrlState('club', '')
  const shownDiff = useMemo(
    () => (diff && clubFilter ? narrowDiffToClub(diff, clubFilter) : diff),
    [diff, clubFilter]
  )
  const clubFilterName =
    diff && clubFilter ? clubNameInDiff(diff, clubFilter) : null

  const eventsByCategory = useMemo(() => {
    const map = new Map<DiffEventCategory, DiffEvent[]>()
    for (const e of shownDiff?.events ?? []) {
      const list = map.get(e.category) ?? []
      list.push(e)
      map.set(e.category, list)
    }
    return map
  }, [shownDiff?.events])

  // Realignment transfers name the district on the other side when the
  // club-district history knows it (#1806). Lazy: no fetch unless the diff
  // carries a transfer.
  // Bounded per view (#2063): rows past the first batch of shards are
  // deferred, and their group offers the next batch.
  const {
    counterparts,
    deferred: deferredCounterparts,
    loadMore: loadMoreCounterparts,
  } = useTransferCounterparts(invalidPair ? undefined : diff, districtId ?? '')

  // The confirmed Distinguished count at each end of the pair (#2438), from
  // that date's own rankings file. Skipped for an invalid pair, like the diff.
  const fromRanking = useDistrictRanking(
    districtId,
    invalidPair ? undefined : from
  )
  const toRanking = useDistrictRanking(districtId, invalidPair ? undefined : to)
  // The same two dates' analytics `distinguishedCounts` (#2601): confirmed
  // first, and the only source of provisional.
  const fromCounts = useDistinguishedCountsAt(
    districtId,
    invalidPair ? undefined : from
  )
  const toCounts = useDistinguishedCountsAt(
    districtId,
    invalidPair ? undefined : to
  )

  if (!districtId) return null

  const enoughHistory = !datesLoading && dates.length >= 2
  const onlyOneSnapshot = !datesLoading && dates.length < 2

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
          {/* Phone context bar (#1831). This page has no PY/date state (its
              window is the from/to pair below), so the chip opens About and
              the trail only. */}
          <ContextBar
            title={districtName}
            back={{ label: districtName, to: `/district/${districtId}` }}
            chipLabel="About"
            about={CHANGES_ABOUT}
            trail={[
              { label: 'Districts', to: '/' },
              { label: districtName, to: `/district/${districtId}` },
              { label: 'What Changed' },
            ]}
          />
          <h1 className="district-changes__title">{districtName}</h1>

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          <section aria-label="What changed" className="district-changes">
            {enoughHistory && (
              <div className="district-changes__controls">
                {/* Time-window presets (#1462) lead: they answer the common
                    questions in one tap, and the raw pickers below stay for the
                    arbitrary pair. Presets write BOTH ends through setPair —
                    one navigation, so no half-pair URL is ever rendered. */}
                <DatePairPresetChips
                  dates={dates}
                  from={from}
                  to={to}
                  onSelect={setPair}
                />
                <DatePairPicker
                  dates={dates}
                  from={from}
                  to={to}
                  onFromChange={setFrom}
                  onToChange={setTo}
                />
              </div>
            )}

            {onlyOneSnapshot && (
              <p
                className="district-changes__empty"
                data-testid="changes-single"
              >
                Only one snapshot has been recorded for {districtName} so far. A
                change digest needs at least two recorded dates — check back
                after the next update.
              </p>
            )}

            {enoughHistory && sameDate && (
              <p
                className="district-changes__empty"
                data-testid="changes-same-date"
              >
                Pick two different dates to see what changed.
              </p>
            )}

            {enoughHistory && reversed && (
              <p
                className="district-changes__empty"
                data-testid="changes-reversed"
              >
                Pick a “from” date that comes before the “to” date.
              </p>
            )}

            {enoughHistory && !invalidPair && (datesLoading || diffLoading) && (
              <LoadingSkeleton variant="card" height="220px" />
            )}

            {enoughHistory && !invalidPair && isError && (
              <p
                className="district-changes__empty"
                data-testid="changes-error"
              >
                Couldn’t load the change digest for {districtName}. Please try
                again.
              </p>
            )}

            {!invalidPair && diff && shownDiff && (
              <>
                {/* Export parity (#1461). The headline names the date pair and
                    the button beside it exports exactly that pair — same diff
                    object, so the CSV can never disagree with what is on
                    screen. Reuses the app-wide ExportButton + the existing
                    exportSnapshotDiff (already wired into ClubsTable); no
                    second exporter, no bespoke button variant. Rendered only
                    inside this `!invalidPair && diff` branch, so the loading,
                    error, single-snapshot and invalid-pair states have no
                    export affordance — and it stands down when the diff is
                    genuinely empty, where the CSV would carry only headers. */}
                <div className="district-changes__headline-row">
                  <p
                    className="district-changes__headline"
                    data-testid="changes-headline"
                  >
                    Changes for {districtName} from {fmtDate(diff.from.date)} to{' '}
                    {fmtDate(diff.to.date)}
                    {diff.dayCount > 0 &&
                      ` · ${diff.dayCount} day${diff.dayCount === 1 ? '' : 's'}`}
                  </p>
                  {(shownDiff.events.length > 0 ||
                    shownDiff.clubs.bothPresent.length > 0) && (
                    <ExportButton
                      onExport={() => exportSnapshotDiff(shownDiff)}
                    />
                  )}
                </div>

                {diff.rosterDiscontinuity && (
                  <p
                    className="district-changes__notice"
                    data-testid="changes-realignment"
                  >
                    The district’s boundaries changed between these dates.{' '}
                    {clubCountPhrase(diff.rosterDiscontinuity.clubsMovedIn)}{' '}
                    moved in and{' '}
                    {clubCountPhrase(diff.rosterDiscontinuity.clubsMovedOut)}{' '}
                    moved out in the {diff.rosterDiscontinuity.toProgramYear}{' '}
                    district realignment. Those clubs did not join or leave on
                    their own, and the totals above compare two differently
                    composed districts.{' '}
                    <a
                      className="district-changes__notice-link"
                      href={REALIGNMENT_METHODOLOGY_HREF}
                    >
                      How a realignment is detected
                    </a>
                  </p>
                )}

                <div className="district-changes__kpis">
                  <KpiDeltaCard
                    title="Membership"
                    current={diff.totals.membership.delta}
                    secondaryLabel={`${diff.totals.membership.from.toLocaleString()} → ${diff.totals.membership.to.toLocaleString()}`}
                  />
                  <KpiDeltaCard
                    title="Payments"
                    current={diff.totals.payments.delta}
                    secondaryLabel={`${diff.totals.payments.from.toLocaleString()} → ${diff.totals.payments.to.toLocaleString()}`}
                  />
                  <KpiDeltaCard
                    title="Active clubs"
                    {...activeClubsTile(diff)}
                  />
                  <KpiDeltaCard
                    title="Distinguished clubs"
                    {...distinguishedClubsTile(
                      fromRanking,
                      toRanking,
                      fromCounts,
                      toCounts
                    )}
                  />
                </div>

                {/* The ?club= filter, named and clearable (#2452). It sits
                    under the KPI tiles, which stay district-wide, and over
                    the list it narrows. Same chip as the Clubs table's
                    filters. Clearing drops only `club`; the date pair stays.
                    An id the diff cannot name still gets a chip, so the
                    filter can always be cleared. */}
                {clubFilter && (
                  <div
                    className="clubs-active-filters district-changes__club-filter"
                    role="region"
                    aria-label="Club filter"
                  >
                    <span className="clubs-active-filters__label">
                      Changes for:
                    </span>
                    <span className="clubs-active-filters__chip">
                      <span className="clubs-active-filters__chip-value">
                        {clubFilterName ?? `Club ${clubFilter}`}
                      </span>
                      <button
                        type="button"
                        className="clubs-active-filters__remove"
                        aria-label="Remove club filter"
                        onClick={() => setClubFilter('')}
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  </div>
                )}

                {/* The club card lists weekly steps; this page diffs only the
                    two end dates, so its numbers can differ (#2459). */}
                {clubFilter && (
                  <p
                    className="district-changes__club-note"
                    data-testid="changes-club-net-note"
                  >
                    Net change between these two dates; the club page lists each
                    weekly step.
                  </p>
                )}

                {shownDiff.events.length === 0 ? (
                  <p
                    className="district-changes__empty"
                    data-testid="changes-none"
                  >
                    {clubFilter
                      ? 'No recorded changes for this club between these two dates.'
                      : 'No recorded changes between these two dates.'}
                  </p>
                ) : (
                  <div
                    className="district-changes__list"
                    data-testid="changes-list"
                  >
                    {CATEGORY_GROUPS.map(({ category, heading }) => (
                      <ChangeGroup
                        key={category}
                        category={category}
                        heading={heading}
                        events={eventsByCategory.get(category) ?? []}
                        districtId={districtId}
                        collapsed={collapsedGroups.includes(category)}
                        onToggle={handleGroupToggle}
                        counterparts={counterparts}
                        deferredCounterparts={deferredCounterparts}
                        onLoadMoreCounterparts={loadMoreCounterparts}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictChangesPage
