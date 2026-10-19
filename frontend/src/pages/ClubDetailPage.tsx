import React, { useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
// One shared definition of "the same club" (#1440) — this file used to hold
// two comparisons that disagreed with each other sixteen lines apart.
import {
  clubIdsMatch,
  findClubEntry,
  normalizeClubId,
} from '@taverns-red/shared-contracts'
import { fetchCdnClubIndex } from '../services/cdn'
import { useDistrictAnalytics, ClubTrend } from '../hooks/useDistrictAnalytics'
import { useGlobalClubRace } from '../hooks/useGlobalClubRace'
import { WorldwideStandingCard } from '../components/clubs/WorldwideStandingCard'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictProgramYearControls } from '../hooks/useDistrictProgramYearControls'
import { useGlobalFreshness } from '../hooks/useLatestAsOfDate'
import { DataControlsBar } from '../components/DataControlsBar'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { ContextBar } from '../components/ContextBar'
import { ContextSheetControls } from '../components/ContextSheetControls'
import { formatFreshnessLine } from '../utils/contextBar'
import {
  isProvisionallyDistinguished,
  getConfirmedLevel,
  getProvisionalTooltip,
} from '../utils/provisionalDistinguished'
import {
  calculateClubProjection,
  type ClubDCPProjection,
  type DistinguishedLevel,
} from '../utils/dcpProjections'
import { isCloseToDistinguished } from '../utils/closeToDistinguished'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { EmptyState, ErrorDisplay } from '../components/ErrorDisplay'
import ErrorBoundary from '../components/ErrorBoundary'
import { ChartSparklineExpand } from '../components/ChartSparklineExpand'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { ClubDCPGoalsPanel } from '../components/ClubDCPGoalsPanel'
import { useClubGoalTimeline } from '../hooks/useClubGoalTimeline'
import { ClubHero, type ClubHeroSource } from '../components/clubs/ClubHero'
import { ClubHeroStatusChips } from '../components/clubs/ClubHeroStatusChips'
import { useAfterPaint } from '../hooks/useAfterPaint'
import { summarizeClubEducation } from '../utils/clubEducation'
import { ClubEducationPanel } from '../components/clubs/ClubEducationPanel'
import {
  summarizeClubCompliance,
  summarizeClubCoach,
} from '../utils/clubCompliance'
import { ClubCompliancePanel } from '../components/clubs/ClubCompliancePanel'
import { ClubLifecyclePanel } from '../components/clubs/ClubLifecyclePanel'
import { useClubDistrictHistoryEntry } from '../hooks/useClubDistrictHistoryEntry'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useSuspendedClubs } from '../hooks/useSuspendedClubs'
import { buildClubLifecycle } from '../utils/clubLifecycle'
import { buildClubLineage, type ClubLineage } from '../utils/clubLineage'
import {
  clubDistrictNotice,
  districtForProgramYear,
  movedAfterDate,
  sameDistrictId,
} from '../utils/clubDistrictSpan'
import { ClubDistrictBanner } from '../components/clubs/ClubDistrictBanner'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import { ClubMiniMap } from '../components/clubs/ClubMiniMap'
import { ClubStatStrip } from '../components/clubs/ClubStatStrip'
import { ClubMembershipTrend } from '../components/clubs/ClubMembershipTrend'
import { MobileRowList } from '../components/MobileRowList'
import { buildClubMeetingInfo, meetingWhen } from '../utils/clubMeetingInfo'

// ── DCP Status Card ────────────────────────────────────────────────────────
// Re-skinned to club-reference.html (#619): a `.club-panel` with a bordered
// header, a 2-cell tier row (Current Level + Outlook), and a per-tier gap list.
// Health-based outlook (#231) and provisional-distinguished handling (#239)
// are preserved — the reference only depicts the on-track/confirmed case.

const OUTLOOK = {
  thriving: { label: 'On Track', icon: '✓', cell: 'dcp-cell--pos' },
  vulnerable: { label: 'At Risk', icon: '⚠', cell: 'dcp-cell--warn' },
  default: { label: 'Unlikely', icon: '✗', cell: 'dcp-cell--bad' },
} as const

function levelLabel(level: DistinguishedLevel): string {
  if (level === 'President') return "President's"
  if (level === 'NotDistinguished') return 'Not Distinguished'
  return level
}

function DCPProjectionCard({
  projection,
  healthStatus,
  isProvisional,
  confirmedLevel,
}: {
  projection: ClubDCPProjection
  healthStatus: string
  isProvisional?: boolean
  confirmedLevel?: DistinguishedLevel
}) {
  const gaps = [
    { tier: 'Distinguished', gap: projection.gapToDistinguished },
    { tier: 'Select', gap: projection.gapToSelect },
    { tier: "President's", gap: projection.gapToPresident },
    { tier: 'Smedley', gap: projection.gapToSmedley },
  ]

  const outlook =
    healthStatus === 'thriving'
      ? OUTLOOK.thriving
      : healthStatus === 'vulnerable'
        ? OUTLOOK.vulnerable
        : OUTLOOK.default

  const isAchieved = projection.currentLevel !== 'NotDistinguished'

  return (
    <section className="club-panel">
      <div className="club-panel__head">
        <h2>
          <svg
            className="club-panel__ico"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <path d="M3 13V8M8 13V3M13 13v-7" />
          </svg>
          DCP Status
        </h2>
      </div>
      <div className="club-panel__body">
        {/* Tier row: Current Level + Outlook */}
        <div className="dcp-tier-row">
          <div className="dcp-cell">
            <div className="dcp-cell__lab">Current Level</div>
            <div
              className={
                'dcp-cell__val' +
                (isAchieved ? ' dcp-cell__val--distinguished' : '')
              }
            >
              {levelLabel(projection.currentLevel)}
            </div>
            {isProvisional && (
              <div className="dcp-cell__provisional">
                Provisional
                {confirmedLevel && confirmedLevel !== 'NotDistinguished' && (
                  <span className="dcp-cell__provisional-confirmed">
                    {' '}
                    — Confirmed: {levelLabel(confirmedLevel)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`dcp-cell ${outlook.cell}`}>
            <div className="dcp-cell__lab">Outlook</div>
            <div className="dcp-cell__val">
              {outlook.icon} {outlook.label}
            </div>
          </div>
        </div>

        {/* Per-tier gap list */}
        <div className="gap-section">
          <h3>Gap to Each Tier</h3>
          {gaps.map(({ tier, gap }) => {
            const met = gap.goals === 0 && gap.members === 0
            const tierLevel = tier === "President's" ? 'President' : tier
            const isCurrentTier = tierLevel === projection.currentLevel
            const tierProvisional = isProvisional && isCurrentTier && met
            const rowClass = met
              ? tierProvisional
                ? 'gap-row gap-row--provisional'
                : 'gap-row gap-row--met'
              : 'gap-row'
            return (
              <div key={tier} className={rowClass}>
                <span className="gap-row__tier">{tier}</span>
                {met ? (
                  <span className="gap-row__val">
                    {tierProvisional ? '⚠ Provisional' : '✓ Met'}
                  </span>
                ) : (
                  <span className="gap-row__val tabular-nums">
                    {gap.goals > 0 &&
                      `${gap.goals} goal${gap.goals > 1 ? 's' : ''}`}
                    {gap.goals > 0 && gap.members > 0 && ' + '}
                    {gap.members > 0 &&
                      `${gap.members} member${gap.members > 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const ClubDetailPage: React.FC = () => {
  const { districtId: urlDistrictId, clubId } = useParams<{
    districtId: string
    clubId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()

  // ── The district for the selected PY (#1804) ───────────────────────────
  // A club that moved district keeps one number, so a link can name a
  // district the club was not in for the year it asks about
  // (`/district/201/club/977?py=2024`: 977 was in District 01 then). The
  // page does not redirect — that loops with the PY selector. It shows the
  // right district's data under a banner; the breadcrumb follows the URL.
  // `districtId` below is the district whose data the page shows.
  //
  // The switch is latched per (URL district, club, selected PY) and made
  // whenever the history places the PY in another district (#2079: the
  // history wins). Only an explicit `?py=` or a URL district that cannot
  // answer (see `needsDistrictResolution`) waits for the history before the
  // hero; a normal visit reads it after first paint. A new
  // PY from the selector (or the back button) is a new key: the URL district
  // is tried again, and the banner goes when it is right.
  const { selectedProgramYear: urlProgramYear } = useUrlProgramYear()
  const resolutionKey = `${urlDistrictId}|${clubId}|${urlProgramYear.year}`
  const [resolvedDistrict, setResolvedDistrict] = useState<{
    key: string
    districtId: string
  } | null>(null)
  const districtId =
    resolvedDistrict?.key === resolutionKey
      ? resolvedDistrict.districtId
      : urlDistrictId
  const isShowingOtherDistrict = districtId !== urlDistrictId

  // #577 — Filter round-trip: when the user arrived from a filtered clubs
  // list, ClubsTable passed the prior search via navigation state. The
  // "Clubs" breadcrumb prefers it so going back restores their filters;
  // deep links without state fall back to the unfiltered clubs route.
  const fromClubsSearch =
    typeof (location.state as { fromClubsSearch?: unknown } | null)
      ?.fromClubsSearch === 'string'
      ? (location.state as { fromClubsSearch: string }).fromClubsSearch
      : ''

  // PY selector state (#1302) — the page owns program year/date (R3). Previously
  // this read `?py=` and computed the effective PY/date inline with no selector
  // UI (users had to edit the URL / use back); the shared district-scoped hook
  // now packages that wiring AND feeds the DataControlsBar chip in the hero.
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    availableDates,
    effectiveProgramYear,
    effectiveEndDate,
    hasValidDates,
    isDatesPending,
    latestSnapshotDate,
    isLatestSnapshot,
  } = useDistrictProgramYearControls(districtId, { selfHeal: false })

  // Fetch raw district statistics for per-goal DCP data (#242). Since #1901
  // it also feeds the hero's first paint (see `snapshotHeroClub`).
  // #1804 — an explicit `?py=` is decided before the hero: the club's
  // history shard (~12 KB) says which district holds that year, and the
  // snapshot read waits for it rather than reading the wrong district.
  // #2079 — the history wins even when the URL district has data for the
  // year: D201's 2026-06-30 file (the 2025-26 close, collected in July under
  // the new structure) lists club 977, but 2025-26 was District 01's.
  const hasExplicitPy = new URLSearchParams(location.search).has('py')
  const isPyDecidedByHistory = !isShowingOtherDistrict && hasExplicitPy
  const isPyMissingHere =
    isPyDecidedByHistory &&
    !isDatesPending &&
    !availableProgramYears.some(py => py.year === selectedProgramYear.year)
  const { history: pyHistory, isLoading: isLoadingPyHistory } =
    useClubDistrictHistoryEntry(clubId, isPyDecidedByHistory)
  const pyHistoryDistrict = districtForProgramYear(
    pyHistory,
    selectedProgramYear.label
  )
  const isHoldingForPy =
    isPyDecidedByHistory &&
    (isLoadingPyHistory ||
      (!!pyHistoryDistrict &&
        !sameDistrictId(pyHistoryDistrict, urlDistrictId ?? '')))
  const { data: districtStats, isLoading: isLoadingStats } =
    useDistrictStatistics(
      hasValidDates && !isHoldingForPy ? districtId || null : null,
      effectiveEndDate ?? undefined
    )

  // #1901 — hero first, analytics after. The analytics file is the whole
  // district's trends (~150 KB on the wire, 3.65 MB decoded); under applied
  // mobile throttling the h1 waited on it until ~6.7 s. The snapshot read
  // above is smaller, already needed, and carries the hero's fields, so the
  // analytics read starts only once that read has settled and its hero (or
  // the skeleton, when the club is not in the snapshot) has painted.
  const analyticsReady = useAfterPaint(
    hasValidDates && !isLoadingStats && !isHoldingForPy
  )

  // #1852 option C — reads that only feed the breadcrumb's district name and
  // the freshness pill wait for the same after-paint gate. Lighthouse's
  // Lantern charges every request that finishes before the LCP paint, and
  // `v1/rankings.json` + `v1/latest.json` used to land just before the h1.
  // Until they arrive the name falls back to `District <id>` and the pill to
  // the snapshot date, both states a slow network already reaches. A district
  // with no snapshot dates never paints a hero, so it does not wait.
  const isHeroPainted = analyticsReady || (!isDatesPending && !hasValidDates)

  // Freshness parity (#1321): the per-district snapshot carries no as-of date —
  // the old `districtStats.asOfDate` was a phantom, so this pill was permanently
  // blank. The shared hook owns the "is this really the latest?" rule.
  const { asOfDate: globalAsOfDate, isLatest: isLatestGlobal } =
    useGlobalFreshness({
      districtLatestSnapshotDate: latestSnapshotDate,
      isLatestSnapshot,
      enabled: isHeroPainted,
    })

  // Fetch district info
  const { data: districtsData } = useDistricts(undefined, {
    enabled: isHeroPainted,
  })
  // The URL's district: the breadcrumb and back links follow the URL (#1804).
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === urlDistrictId
  )
  const rawName = selectedDistrict?.name || urlDistrictId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName

  // Fetch district analytics to get this club's data
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    isError,
    error,
    refetch,
  } = useDistrictAnalytics(
    hasValidDates && !isHoldingForPy ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined,
    { enabled: analyticsReady }
  )
  // Held counts as loading: the gate is part of the analytics read. A
  // settled read (data or error) is never "held".
  const isLoading =
    isLoadingAnalytics ||
    (hasValidDates && !analyticsReady && !analytics && !isError)

  // Find the club
  const club: ClubTrend | null = useMemo(() => {
    if (!analytics || !clubId) return null
    return analytics.allClubs.find(c => clubIdsMatch(c.clubId, clubId)) ?? null
  }, [analytics, clubId])

  // #1901 — the same club in the district snapshot's transformed `clubs[]`.
  // It carries the values analytics copies into ClubTrend (name, area,
  // division, charter date, meeting fields), so the hero can paint before
  // analytics arrives. The analytics-derived pills wait for analytics.
  const snapshotHeroClub: ClubHeroSource | null = useMemo(() => {
    if (!districtStats || !clubId) return null
    const raw = districtStats as unknown as Record<string, unknown>
    const statsData = (raw['data'] ?? raw) as Record<string, unknown>
    const clubs = statsData['clubs'] as ClubHeroSource[] | undefined
    if (!Array.isArray(clubs)) return null
    const found = clubs.find(c => clubIdsMatch(c.clubId, clubId))
    return found && typeof found.clubName === 'string' ? found : null
  }, [districtStats, clubId])

  // Worldwide standing (#1556): the race artifact for the SAME pinned date
  // this page reads (Lesson 59). Absent artifact → no card, never an error.
  // #1843 — the card is at the bottom of the page, so its read waits for the
  // same after-paint gate as analytics: before, it started with the hero's
  // snapshot read (twice — "latest" and then the pinned date).
  const { race: globalRace, reachedById: raceReachedById } = useGlobalClubRace(
    effectiveEndDate ?? undefined,
    { enabled: analyticsReady && !!effectiveEndDate }
  )

  // ── Moved-club lookup (#1441) ─────────────────────────────────────────────
  // The 2026-07-01 reformation moved clubs between districts, so every link
  // made before July points at a club's OLD district. `config/club-index.json`
  // maps every club to its CURRENT district and is rebuilt wholesale each
  // pipeline run; `ClubRedirectPage` already consumes it through this same
  // `fetchCdnClubIndex` helper and query key, so a warm cache is reused rather
  // than refetched. `enabled` keeps the happy path (club present in this
  // district) free of any extra CDN request.
  //
  // #1830 — the index is ~975 KB on the wire, so "the club is absent" must be
  // a SETTLED answer, not the absence of one: while the district's dates load,
  // the analytics query is disabled (no data, `isLoading` false), which used to
  // satisfy `!club && !isLoading` and pull the whole index on every cold visit.
  // Absent means: analytics loaded without the club, or the district has no
  // snapshot dates at all (analytics will never load).
  const isClubAbsentSettled =
    !club && (!!analytics || (!isDatesPending && !hasValidDates))

  // #1804 — when the URL district cannot answer for the selected PY (its
  // dates lack an explicit `?py=`, or its data lacks the club), the club's
  // history shard says which district held the club that year, and the page
  // latches onto it (see `resolvedDistrict`). #1843/#1805 — the same read
  // feeds the Lifecycle timeline and the hero's lineage chip; on a normal
  // visit it starts with the analytics read, after first paint (#1901), so it
  // never competes with the hero's reads, and the full render waits for it
  // (see `isHoldingForHistory`).
  const isClubAbsentHere =
    !isShowingOtherDistrict && isClubAbsentSettled && !isLoading && !isError
  const needsDistrictResolution = isPyMissingHere || isClubAbsentHere
  const { history: clubDistrictHistory, isLoading: isLoadingHistory } =
    useClubDistrictHistoryEntry(
      clubId,
      analyticsReady || needsDistrictResolution
    )
  // #2079 — whenever the history has arrived, its district for the PY wins
  // over the URL's, even when the URL district's data lists the club.
  const resolutionTarget = isShowingOtherDistrict
    ? null
    : districtForProgramYear(
        clubDistrictHistory ?? pyHistory,
        selectedProgramYear.label
      )
  const isTargetElsewhere =
    !!resolutionTarget && !sameDistrictId(resolutionTarget, urlDistrictId ?? '')
  // Latched while rendering (React's "adjust state on a change" pattern),
  // not in an effect: the next render already reads the right district.
  if (
    isTargetElsewhere &&
    resolutionTarget &&
    resolvedDistrict?.key !== resolutionKey
  ) {
    setResolvedDistrict({ key: resolutionKey, districtId: resolutionTarget })
  }
  const isResolvingDistrict =
    isHoldingForPy ||
    isTargetElsewhere ||
    (needsDistrictResolution && isLoadingHistory)

  // The current-district index, only when the history could not place the
  // club elsewhere for this year (#1804): it then says where the club is now.
  const isClubIndexEnabled =
    !!clubId && isClubAbsentHere && !isLoadingHistory && !isTargetElsewhere
  const { data: clubIndex, isError: isClubIndexError } = useQuery({
    queryKey: ['club-index'],
    queryFn: fetchCdnClubIndex,
    staleTime: 15 * 60 * 1000,
    enabled: isClubIndexEnabled,
  })

  // Where the index says this club lives now — null unless the index both
  // knows the club AND places it in a DIFFERENT district than the URL claims.
  // Anything less (absent from the index, same district, fetch failed) stays
  // null so the cautious "may have been removed" copy survives: we only assert
  // a move the index actually substantiates.
  const movedTo = useMemo(() => {
    if (club || !clubId || !clubIndex) return null
    // Same lookup form ClubRedirectPage uses — now the shared, padding-
    // tolerant one (#1440, taking the one-line swap #1441 staged here). The
    // index is keyed by whichever club-id form the snapshot that generated it
    // stored, so an exact-key lookup would report "may have been removed" for
    // a club that did move and IS in the index, just under the other form.
    const entry = findClubEntry(clubIndex.clubs, clubId)
    if (!entry?.districtId || entry.districtId === urlDistrictId) return null
    return entry
  }, [club, clubId, clubIndex, urlDistrictId])
  // #1804 — the move's date, when the history can vouch for one.
  const movedToAfter = movedTo
    ? movedAfterDate(
        clubDistrictHistory,
        urlDistrictId ?? '',
        movedTo.districtId
      )
    : null

  const movedToName = useMemo(() => {
    if (!movedTo) return ''
    const match = districtsData?.districts?.find(
      d => d.id === movedTo.districtId
    )
    const raw = match?.name || movedTo.districtId
    return /^\d+$/.test(raw) ? `District ${raw}` : raw
  }, [movedTo, districtsData])

  // Find matching raw CSV record for per-goal progress (#242)
  const clubRawRecord = useMemo(() => {
    if (!districtStats || !clubId) return null
    // CDN snapshot wraps actual statistics under 'data' key
    const raw = districtStats as unknown as Record<string, unknown>
    const statsData = raw['data'] as Record<string, unknown> | undefined
    const records = (statsData?.['clubPerformance'] ??
      raw['clubPerformance']) as
      Array<Record<string, string | number | null>> | undefined
    if (!records) return null
    return records.find(r => clubIdsMatch(r['Club Number'], clubId)) ?? null
  }, [districtStats, clubId])

  // #1790 — the club's dashboard divisionPerformance row (round 1/2 visit
  // awards), from the same raw snapshot as clubRawRecord.
  const clubDivisionRecord = useMemo(() => {
    if (!districtStats || !clubId) return null
    const raw = districtStats as unknown as Record<string, unknown>
    const statsData = raw['data'] as Record<string, unknown> | undefined
    const records = (statsData?.['divisionPerformance'] ??
      raw['divisionPerformance']) as
      Array<Record<string, string | number | null>> | undefined
    return records?.find(r => clubIdsMatch(r['Club'], clubId)) ?? null
  }, [districtStats, clubId])

  // The program year the page is showing — the authority for which
  // recognition rungs existed (#1406). Resolved before the projection memo
  // because that memo now depends on it.
  const programYear = effectiveProgramYear ?? selectedProgramYear

  // #1790 — this club's slice of the education ledger for the page's date.
  const educationSummary = useMemo(
    () => summarizeClubEducation(analytics?.districtReports, clubId ?? ''),
    [analytics, clubId]
  )

  // #1790 — compliance rows and coach, against the page's PY and pinned
  // date (R3) so a historical date shows what was true then.
  const complianceRows = useMemo(
    () =>
      summarizeClubCompliance({
        reports: analytics?.districtReports,
        clubId: clubId ?? '',
        divisionRecord: clubDivisionRecord,
        charterDate: club?.charterDate,
        programYear: programYear.label,
        snapshotDate: effectiveEndDate ?? programYear.endDate,
      }),
    [analytics, clubId, clubDivisionRecord, club, programYear, effectiveEndDate]
  )
  const coachSummary = useMemo(
    () => summarizeClubCoach(analytics?.districtReports, clubId ?? ''),
    [analytics, clubId]
  )

  // #1843 — Lifecycle timeline: charter (snapshot), district spans (the
  // club-district-history shard read above) and, only for a club the
  // dashboard lists as Suspended, its `Susp` date from the page date's
  // suspended-clubs.json (#1953, R3), read once the club's analytics lands.
  // #1805 — "District 201 (District 1 until June 2026)".
  const lineage = useMemo(
    () => buildClubLineage(clubDistrictHistory, districtId),
    [clubDistrictHistory, districtId]
  )
  const isSuspended = club?.clubStatus === 'Suspended'
  const { clubs: suspendedClubs, isLoading: isLoadingSuspended } =
    useSuspendedClubs(
      districtId,
      isSuspended ? (effectiveEndDate ?? undefined) : undefined
    )
  // #2169 — where our records start for the club's district: the earliest
  // date of the per-district snapshot index (the same shared index entry the
  // page's PY controls read, so no extra fetch). The district is the first
  // one the history saw the club in, else the page's.
  const recordsDistrictId =
    clubDistrictHistory?.spans[0]?.districtId ?? districtId
  const { data: recordsDates, isPending: isLoadingRecordsDates } =
    useDistrictCachedDates(recordsDistrictId || null, !!club)
  const recordsStartDate = recordsDates?.dateRange?.startDate ?? null
  const lifecycle = useMemo(() => {
    if (!club || isLoadingHistory) return null
    if (isSuspended && isLoadingSuspended) return null
    if (recordsDistrictId && isLoadingRecordsDates) return null
    const suspendDate =
      suspendedClubs?.find(s => clubIdsMatch(s.clubNumber, club.clubId))
        ?.suspendDate ?? null
    return buildClubLifecycle({
      charterDate: club.charterDate,
      history: clubDistrictHistory,
      suspendDate,
      recordsStartDate,
    })
  }, [
    club,
    isLoadingHistory,
    clubDistrictHistory,
    isSuspended,
    isLoadingSuspended,
    suspendedClubs,
    recordsDistrictId,
    isLoadingRecordsDates,
    recordsStartDate,
  ])

  // Compute DCP projection
  const projection: ClubDCPProjection | null = useMemo(() => {
    if (!club) return null
    return calculateClubProjection(club, programYear.label)
  }, [club, programYear])

  // Close-to-Distinguished banner gate (#620, #903). Uses the ONE shared
  // canonical predicate (closeToDistinguished.ts) — NotDistinguished, members
  // gap <= 3, goals >= 3, CSP submitted-or-unknown — so this banner and the
  // clubs-table preset can never diverge. The encouragement copy below is
  // derived locally from the projection's already-floored gap.
  const isCloseBanner = useMemo(
    () =>
      !!club &&
      !!projection &&
      isCloseToDistinguished({
        projection,
        cspSubmitted: club.cspSubmitted,
      }),
    [club, projection]
  )
  const closeBannerCopy = useMemo(() => {
    if (!projection) return ''
    const { members, goals } = projection.gapToDistinguished
    const parts: string[] = []
    if (members > 0)
      parts.push(`${members} more member${members > 1 ? 's' : ''}`)
    if (goals > 0) parts.push(`${goals} more DCP goal${goals > 1 ? 's' : ''}`)
    return parts.length > 0
      ? `Just ${parts.join(' and ')} to reach Distinguished.`
      : 'On track for Distinguished — finish strong!'
  }, [projection])

  // Filter trends by program year (resolved above, with the projection).
  const filteredMembershipTrend = useMemo(() => {
    if (!club) return []
    return club.membershipTrend.filter(
      p => p.date >= programYear.startDate && p.date <= programYear.endDate
    )
  }, [club, programYear])

  const filteredDcpGoalsTrend = useMemo(() => {
    if (!club) return []
    return club.dcpGoalsTrend.filter(
      p => p.date >= programYear.startDate && p.date <= programYear.endDate
    )
  }, [club, programYear])

  // Goal Achievement Timeline rows (#621). Built from the PY-filtered trend so
  // nearest-prior fallback stays within the selected program year. As-of date =
  // the effective end date (most recent snapshot in the PY), falling back to
  // the PY end if dates haven't resolved yet.
  const goalTimelineRows = useClubGoalTimeline(
    filteredDcpGoalsTrend,
    programYear,
    effectiveEndDate ?? programYear.endDate
  )

  // Compute stats
  const baseMembership =
    club?.membershipBase ??
    (filteredMembershipTrend.length > 0
      ? (filteredMembershipTrend[0]?.count ?? 0)
      : 0)
  const latestMembership =
    filteredMembershipTrend.length > 0
      ? (filteredMembershipTrend[filteredMembershipTrend.length - 1]?.count ??
        0)
      : 0
  const membershipChange = latestMembership - baseMembership
  const latestDcpGoals =
    filteredDcpGoalsTrend.length > 0
      ? (filteredDcpGoalsTrend[filteredDcpGoalsTrend.length - 1]
          ?.goalsAchieved ?? 0)
      : 0

  const membershipChangePct =
    baseMembership > 0 ? (membershipChange / baseMembership) * 100 : null

  // #875 (epic #876, CC-3): collapsed-mobile sparkline series for the
  // membership trend — the same counts the hand-rolled .mem-chart plots.
  const membershipSparkline = useMemo(
    () => filteredMembershipTrend.map(p => p.count),
    [filteredMembershipTrend]
  )

  // En-dashed year for display ("2025–2026"), per reference. Used in both the
  // panel meta and the chart's aria-label so they stay in sync.
  const programYearLabelDisplay = programYear.label.replace(/-/g, '–')

  // Per-route title (#780): club + district, falling back to the branded
  // default while the club is still loading or absent.
  useDocumentTitle(club ? `${club.clubName} — ${districtName}` : null)

  // #1804 — the banner when the page shows another district's data than
  // its URL names (the breadcrumb keeps following the URL).
  const districtNotice = useMemo(
    () =>
      isShowingOtherDistrict
        ? clubDistrictNotice(clubDistrictHistory, {
            urlDistrictId: urlDistrictId ?? '',
            shownDistrictId: districtId ?? '',
            programYearLabel: programYear.label,
          })
        : null,
    [
      isShowingOtherDistrict,
      clubDistrictHistory,
      urlDistrictId,
      districtId,
      programYear.label,
    ]
  )

  // The page top: context bar, breadcrumb and hero. Shared by the full
  // render and the hero-first render (#1901), so the h1 and everything
  // above it keep one geometry while analytics loads in behind them.
  const renderTop = (
    heroClub: ClubHeroSource,
    statusPills?: React.ReactNode,
    heroLineage?: ClubLineage | null
  ) => (
    <>
      {/* Phone context bar (#1831, review §6.3): below 768 it replaces the
          breadcrumb and the hero's PY/date chips (no top padding there, so
          it sits under the top bar); the hero stays as the page content.
          PY/date are this page's own state (R3). */}
      <ContextBar
        title={heroClub.clubName}
        back={{
          label: 'Clubs',
          to: `/district/${urlDistrictId}/clubs${fromClubsSearch}`,
        }}
        programYear={effectiveProgramYear ?? selectedProgramYear}
        date={effectiveEndDate ?? latestSnapshotDate}
        controls={
          <ContextSheetControls
            availableProgramYears={availableProgramYears}
            selectedProgramYear={effectiveProgramYear ?? selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshness={formatFreshnessLine({
              asOfDate: globalAsOfDate,
              snapshotDate: effectiveEndDate ?? latestSnapshotDate,
              isLatest: isLatestGlobal,
            })}
          />
        }
        about="This club's membership, DCP goals, recognition and education for the selected program year."
        trail={[
          { label: 'Districts', to: '/' },
          { label: districtName, to: `/district/${urlDistrictId}` },
          {
            label: 'Clubs',
            to: `/district/${urlDistrictId}/clubs${fromClubsSearch}`,
          },
          { label: heroClub.clubName },
        ]}
      />
      {/* Breadcrumbs (#577) — leading 'Home' crumb removed per #442
          (the AppShell's 'Districts' active nav is the top-level
          signal). Trail: District › Clubs › <club>. The Clubs crumb
          restores the user's prior filtered list (filter round-trip). */}
      <SubpageBreadcrumb
        crumbs={[
          { label: districtName, to: `/district/${urlDistrictId}` },
          {
            label: 'Clubs',
            to: `/district/${urlDistrictId}/clubs${fromClubsSearch}`,
          },
          { label: heroClub.clubName },
        ]}
      />

      {districtNotice && (
        <ClubDistrictBanner
          notice={districtNotice}
          openTo={`/district/${districtId}/club/${clubId}${location.search}`}
        />
      )}

      <ClubHero
        clubId={clubId ?? ''}
        districtId={districtId}
        club={heroClub}
        statusPills={statusPills}
        lineage={heroLineage}
        controls={
          <DataControlsBar
            latestSnapshotDate={effectiveEndDate ?? latestSnapshotDate}
            asOfDate={globalAsOfDate}
            isLatest={isLatestGlobal}
            availableProgramYears={availableProgramYears}
            // Show the DERIVED (healed) year so the chip is honest even
            // when `?py=` names a year without data. selfHeal is off here
            // to protect the #577 navigation state.
            selectedProgramYear={effectiveProgramYear ?? selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        }
      />
    </>
  )

  // ── Loading state ────────────────────────────────────────────────────────

  // #1901 — hero first: the snapshot's hero while analytics loads behind it.
  // The same element tree as the full render down to the hero (ErrorBoundary
  // included), so React keeps the hero's DOM when analytics lands and nothing
  // above the fold moves. The tree differs from the plain skeleton below, so
  // that skeleton's nodes are replaced rather than pushed down (no CLS).
  // #1804 — while the history decides which district holds the selected PY,
  // the plain skeleton: neither district's figures are claimed yet.
  if (isResolvingDistrict) {
    return (
      <div className="min-h-screen" aria-busy="true">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton variant="card" />
          <div className="mt-6">
            <LoadingSkeleton variant="chart" height="400px" />
          </div>
        </div>
      </div>
    )
  }

  // #1805 — the full render also waits for the club's history shard, so the
  // hero's lineage chip lands in the same commit as the analytics panels
  // instead of pushing painted content down on its own. The shard is ~12 KB
  // and starts with the ~150 KB analytics read, so this rarely waits.
  const isHoldingForHistory = !!club && isLoadingHistory
  if ((isLoading || isHoldingForHistory) && snapshotHeroClub) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen" aria-busy="true">
          <div className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-6 sm:pb-6 md:pt-6 [--context-bar-bleed:16px] sm:[--context-bar-bleed:24px]">
            {renderTop(snapshotHeroClub)}
            <div className="mt-6">
              <LoadingSkeleton variant="chart" height="400px" />
            </div>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton variant="card" />
          <div className="mt-6">
            <LoadingSkeleton variant="chart" height="400px" />
          </div>
        </div>
      </div>
    )
  }

  // ── Fetch error ──────────────────────────────────────────────────────────
  // #1104 — a transient CDN/analytics fetch reject must surface a distinct,
  // retryable error state. Checked BEFORE the not-found branch below, because
  // on error `analytics` is undefined and `club` is null too — without this
  // gate the page would falsely claim "Club Not Found" (that the club was
  // removed) for what is really a network failure. Same outer wrapper geometry
  // as the loading / not-found states so the error path adds no layout shift
  // (L125).

  if (isError) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <ErrorDisplay
            error={error ?? 'Failed to load club data'}
            title="Failed to Load Club"
            onRetry={() => {
              refetch()
            }}
            showDetails={true}
          />
        </div>
      </div>
    )
  }

  // ── Club absent from this district ───────────────────────────────────────
  // #1441 — three distinct outcomes, and the copy must not overreach past what
  // the club index actually substantiates:
  //   1. index still in flight  → say nothing yet (a "removed" flash would be
  //      a claim we are about to contradict)
  //   2. index places the club elsewhere → it MOVED; name the district and
  //      offer the link
  //   3. anything else (absent from the index, index unreachable, index agrees
  //      with this district) → the pre-existing cautious copy

  // Unresolved = enabled, but neither settled to data nor to an error yet.
  // Deliberately NOT `isFetching`: on the render where `enabled` flips true the
  // query is still 'idle', which would leak one frame of "may have been
  // removed" before the lookup even starts.
  // #1804 — on another district's data the index is not read (the history
  // already placed the club); a district whose dates are still loading has
  // not answered yet either.
  const isClubIndexUnresolved =
    !!clubId &&
    (isDatesPending ||
      (!isShowingOtherDistrict && !clubIndex && !isClubIndexError))

  if (!club && isClubIndexUnresolved) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton variant="card" />
        </div>
      </div>
    )
  }

  if (!club && movedTo) {
    // The index is a CURRENT mapping, so the destination link deliberately
    // drops the `?py=` this URL may carry: the club was genuinely in this
    // district for older program years, and forwarding that year would land
    // the visitor on a second dead end.
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Club Moved Districts"
            message={
              movedToAfter
                ? `${movedTo.clubName || `Club ${clubId}`} is no longer in ${districtName} — it moved to ${movedToName} after ${movedToAfter}.`
                : `${movedTo.clubName || `Club ${clubId}`} is no longer in ${districtName} — it is now in ${movedToName}.`
            }
            icon="search"
            action={{
              label: `View this club in ${movedToName}`,
              onClick: () =>
                navigate(`/district/${movedTo.districtId}/club/${clubId}`),
            }}
          />
        </div>
      </div>
    )
  }

  if (!club) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Club Not Found"
            message={`Club ${clubId} was not found in ${districtName}. It may have been removed or the club ID may be incorrect.`}
            icon="data"
            action={{
              label: 'Back to District',
              onClick: () => navigate(`/district/${urlDistrictId}`),
            }}
          />
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // #1843 — the where-it-meets fields the rows and the mini-map reuse (the
  // one builder that drops email, phone and meeting links).
  const heroMeetingInfo = buildClubMeetingInfo(club)

  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        {/* #618 — page container locked to the reference 1280px max-width
            with 24px padding (16px ≤640px), replacing Tailwind's `container`
            (which widens to 1536px at 2xl). */}
        <div className="mx-auto max-w-[1280px] px-4 pb-4 sm:px-6 sm:pb-6 md:pt-6 [--context-bar-bleed:16px] sm:[--context-bar-bleed:24px]">
          {renderTop(
            club,
            <ClubHeroStatusChips
              status={club.currentStatus}
              distinguishedLevel={club.distinguishedLevel}
              provisionalTitle={
                isProvisionallyDistinguished(club)
                  ? getProvisionalTooltip(club, programYear.label)
                  : undefined
              }
            />,
            lineage
          )}

          {/* Stat strip (#618; #1843 review §6.3) — 2×2 at 375, 4×2 from
              768; the cells past the first four fold behind `?stats=1` on
              phones. Awards and Coach (#1790) are read from the Education
              and Compliance panels directly below, not repeated here. */}
          <ClubStatStrip
            stats={[
              { label: 'Base', value: baseMembership },
              { label: 'Current', value: latestMembership },
              {
                label: 'Net Δ',
                value: `${membershipChange > 0 ? '+' : ''}${membershipChange}`,
                valClass:
                  membershipChange > 0
                    ? 'pos'
                    : membershipChange < 0
                      ? 'neg'
                      : '',
              },
              { label: 'DCP Goals', value: `${latestDcpGoals}/10` },
              {
                label: 'Oct Renewals',
                value: club.octoberRenewals ?? '—',
                valClass: club.octoberRenewals === undefined ? 'muted' : '',
              },
              {
                label: 'Apr Renewals',
                value: club.aprilRenewals ?? '—',
                valClass: club.aprilRenewals === undefined ? 'muted' : '',
              },
              {
                label: 'New Members',
                value: club.newMembers ?? '—',
                valClass: club.newMembers === undefined ? 'muted' : '',
              },
              {
                label: 'CSP',
                value:
                  club.cspSubmitted === undefined
                    ? '—'
                    : club.cspSubmitted
                      ? '✓'
                      : '✗',
                valClass:
                  club.cspSubmitted === undefined
                    ? 'muted'
                    : club.cspSubmitted
                      ? 'tick'
                      : 'cross',
                title:
                  club.cspSubmitted === undefined
                    ? 'CSP data not available for this program year'
                    : club.cspSubmitted
                      ? 'Club Success Plan submitted'
                      : 'Club Success Plan not submitted — required for Distinguished',
              },
            ]}
          />

          {/* 2/3 + 1/3 row — Membership Trend + DCP Status (#619), pixel-mapped
              to club-reference.html. The chart is hand-rolled SVG (not Recharts):
              it already nails the program-year-day x-axis, and CSS-classed
              stroke/area/dot make the dark-mode swap a pure CSS override (R10). */}
          <div className="club-trend-grid">
            {/* Membership Trend (2/3) */}
            <section className="club-panel">
              <div className="club-panel__head">
                <h2>
                  <svg
                    className="club-panel__ico"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  >
                    <path d="M2 13l3-4 3 2 6-7" />
                    <path d="M10 4h3v3" />
                  </svg>
                  Membership Trend
                </h2>
                <span className="club-panel__meta">
                  Program Year {programYearLabelDisplay} ·{' '}
                  {filteredMembershipTrend.length} data point
                  {filteredMembershipTrend.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="club-panel__body">
                {filteredMembershipTrend.length > 0 ? (
                  <ChartSparklineExpand
                    urlId="membership"
                    title="Membership Trend"
                    sparklineData={membershipSparkline}
                    headline={
                      <>
                        {latestMembership} members
                        {membershipChange !== 0 &&
                          ` (${membershipChange > 0 ? '+' : ''}${membershipChange})`}
                      </>
                    }
                  >
                    <>
                      <div className="chart-stats">
                        <div className="chart-stats__row">
                          <span className="chart-stats__label">Base</span>
                          <span className="chart-stats__val">
                            {baseMembership}
                          </span>
                        </div>
                        <div className="chart-stats__row">
                          <span className="chart-stats__label">Current</span>
                          <span className="chart-stats__val">
                            {latestMembership}
                          </span>
                        </div>
                        <div className="chart-stats__row">
                          <span className="chart-stats__label">Change</span>
                          <span
                            className={
                              'chart-stats__val' +
                              (membershipChange > 0
                                ? ' chart-stats__val--pos'
                                : membershipChange < 0
                                  ? ' chart-stats__val--neg'
                                  : '')
                            }
                          >
                            {membershipChange >= 0 ? '+' : ''}
                            {membershipChange}
                            {membershipChangePct !== null &&
                              ` (${membershipChangePct >= 0 ? '+' : ''}${membershipChangePct.toFixed(1)}%)`}
                          </span>
                        </div>
                      </div>

                      {/* #1791 — prior program years faint behind the
                          current line (#1705's shared builder, D15 anchor);
                          their read starts only where this mounts. */}
                      <ClubMembershipTrend
                        districtId={districtId ?? ''}
                        clubId={clubId ?? club.clubId}
                        current={filteredMembershipTrend}
                        programYearLabel={programYear.label}
                      />
                    </>
                  </ChartSparklineExpand>
                ) : (
                  <EmptyState
                    title="No Membership Data"
                    message="No membership trend data available for this program year."
                    icon="data"
                  />
                )}
              </div>
            </section>

            {/* DCP Status (1/3) */}
            {projection && (
              <DCPProjectionCard
                projection={projection}
                healthStatus={club.currentStatus}
                isProvisional={isProvisionallyDistinguished(club)}
                confirmedLevel={getConfirmedLevel(club, programYear.label)}
              />
            )}
          </div>

          {/* #1783 — §3.2 panel slot: the club's own panels render here,
              between the trend row and the callouts. #1790 — Education from
              the reports ledger the analytics hook already fetched for the
              page's date (R3); always rendered, so the loaded page never
              shifts when the sidecar is absent ("not available" copy).
              Compliance (#1790) sits beside it from 768px. */}
          <div className="club-panels-grid">
            <ClubEducationPanel
              summary={educationSummary}
              programYearLabel={programYear.label}
            />
            <ClubCompliancePanel rows={complianceRows} coach={coachSummary} />
            <ClubLifecyclePanel lifecycle={lifecycle} isLoading={!lifecycle} />
          </div>

          {/* Risk Factors */}
          {club.riskFactors.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg shadow-sm p-6">
              <h2 className="font-semibold text-red-900 mb-3 flex items-center gap-2 font-tm-headline">
                ⚠️ Risk Factors
              </h2>
              <div className="space-y-2">
                {club.riskFactors.map((factor, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-red-600 mt-0.5">•</span>
                    <span className="text-red-900 font-tm-body">{factor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close-to-Distinguished call-out (#366, #433; repositioned #620).
              club-reference.html places it directly below the 2/3 + 1/3 trend
              row and above the DCP Goals panel — moved here from above the
              stats grid. Show/hide is now gated by the shared canonical
              isCloseToDistinguished predicate (#903) so this banner and the
              clubs-table preset agree by construction; the copy is derived
              locally from the projection's gap. */}
          {isCloseBanner && (
            <section
              role="region"
              aria-labelledby="close-to-distinguished-heading"
              className="club-close-to-distinguished"
            >
              <span
                aria-hidden="true"
                className="club-close-to-distinguished__icon"
              >
                ★
              </span>
              <div className="club-close-to-distinguished__body">
                <h2
                  id="close-to-distinguished-heading"
                  className="club-close-to-distinguished__title"
                >
                  Close to Distinguished
                </h2>
                <p className="club-close-to-distinguished__copy">
                  {closeBannerCopy}
                </p>
              </div>
            </section>
          )}

          {/* DCP Goals Progress panel (#620 + #621) — pixel-mapped to
              club-reference.html: a current-progress bar, the Goal Achievement
              Timeline (#621), then a flat per-goal status grid. The bar + meta
              use the authoritative trend count (always present); the per-goal
              grid uses the raw clubPerformance record; the timeline rows are
              computed from the PY-filtered trend (R3 — passed in, not
              re-derived in the child). */}
          <ClubDCPGoalsPanel
            goalsAchieved={latestDcpGoals}
            clubRecord={clubRawRecord}
            isLoading={isLoadingStats}
            timelineRows={goalTimelineRows}
          />

          {/* Worldwide standing (#1556) — cohort percentile for any club; a
              rank only when the club has reached a tier. #1783 moved it below
              the DCP goals grid per the §3.2 layout: the club's own numbers
              first, the worldwide comparison last. The mini-map (#1843)
              follows it. */}
          <WorldwideStandingCard
            race={globalRace}
            clubId={normalizeClubId(club.clubId)}
            goalsMet={
              club.dcpGoalsTrend[club.dcpGoalsTrend.length - 1]
                ?.goalsAchieved ?? 0
            }
            members={latestMembership}
            reached={raceReachedById.get(normalizeClubId(club.clubId)) ?? null}
          />

          {/* #1843 — "View multi-year history" leaves the phone hero and
              becomes a row here (review §6.3); ≥768 keeps the hero link and
              hides this list (CSS). */}
          <div className="club-more">
            <MobileRowList
              label="More about this club"
              rows={[
                {
                  id: 'history',
                  to: `/district/${districtId}/club/${clubId}/history`,
                  title: 'Multi-year history',
                  meta: 'Every program year for this club',
                },
                // The phone hero keeps "Contact on toastmasters.org" only;
                // the club's own site is a row here. Same filtered URL as
                // the hero (never a meeting link, #1879).
                ...(heroMeetingInfo?.websiteUrl
                  ? [
                      {
                        id: 'website',
                        to: heroMeetingInfo.websiteUrl,
                        title: 'Club website',
                        meta: new URL(heroMeetingInfo.websiteUrl).hostname,
                        external: true,
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          {/* #1843 / #2162 — Location mini-map: an inline SVG from the
              coordinates analytics already carries, replaced by real tiles
              once the card nears the viewport after the hero painted,
              linking to the district club map with this club selected. */}
          <ClubMiniMap
            heroPainted={isHeroPainted}
            districtId={districtId ?? ''}
            clubId={clubId ?? club.clubId}
            clubName={club.clubName}
            clubs={analytics?.allClubs ?? []}
            place={heroMeetingInfo?.place}
            meetsOnline={club.meetsOnline === true}
            when={meetingWhen(club)}
          />

          {/* Bottom back-link (#618) — the redesign reintroduces a footer
              back affordance as an anchor (reference `.back-link` <a>), so a
              user who has scrolled the full page can return without scrolling
              back up to the breadcrumb. #577 removed the old *button*; this is
              a single styled link, not a duplicate button. */}
          <Link to={`/district/${urlDistrictId}`} className="club-back-link">
            <svg
              className="club-back-link__icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 13L5 8l5-5"
              />
            </svg>
            Back to {districtName}
          </Link>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default ClubDetailPage
