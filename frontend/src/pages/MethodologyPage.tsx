import React, { useCallback, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsMobile } from '../hooks/useIsMobile'
import { useUrlState } from '../hooks/useUrlState'
import CollapsibleSection from '../components/CollapsibleSection'
import JumpToChip from '../components/JumpToChip'
import { RedVoteMadeByLine } from '../components/RedVotePromo'
import {
  OPEN_SECTIONS_PARAM,
  parseOpenSections,
  serializeOpenSections,
  resolveHashTarget,
} from '../utils/methodologyUrl'
import {
  PROGRAM_YEAR_RULE_CHANGES,
  ruleChangesByProgramYear,
} from '../content/programYearRuleChanges'

/* Methodology page (#368). Authored fresh from analytics-core as the
   source of truth — Borda formula, DCP thresholds, club health
   classifications, refresh cadence. Future updates should land here
   first; the codebase comments reference this page for canonical
   definitions.

   #373: borda-count, dcp-tiers, and caveats sections link reciprocally
   back to the /awards page so readers can pivot between the formula
   and the live leaderboard. */

const SECTIONS: ReadonlyArray<{ id: string; num: string; title: string }> = [
  { id: 'data-source', num: '01', title: 'Data source & access' },
  { id: 'refresh-cadence', num: '02', title: 'Refresh cadence' },
  { id: 'borda-count', num: '03', title: 'Borda count scoring' },
  { id: 'regions-borda', num: '04', title: 'Region-level scoring' },
  { id: 'dcp-tiers', num: '05', title: 'DCP tier definitions' },
  { id: 'club-health', num: '06', title: 'Club health classifications' },
  {
    id: 'district-membership-trend',
    num: '07',
    title: 'District Membership Trend',
  },
  { id: 'glossary', num: '08', title: 'Glossary' },
  { id: 'caveats', num: '09', title: 'Caveats & known issues' },
  {
    id: 'program-year-rule-changes',
    num: '10',
    title: 'Program-year rule changes',
  },
  { id: 'worldwide-rollup', num: '11', title: 'Worldwide rollup' },
  { id: 'club-race', num: '12', title: 'Worldwide club race' },
  { id: 'officer-training', num: '13', title: 'Officer training' },
  { id: 'member-data', num: '14', title: 'Member-level data' },
  {
    id: 'region-recognition',
    num: '15',
    title: 'Region District Recognition',
  },
  {
    id: 'council-voting-strength',
    num: '16',
    title: 'Council voting strength',
  },
  {
    id: 'club-growth-prospective',
    num: '17',
    title: 'Prospective clubs',
  },
  { id: 'success-plan-targets', num: '18', title: 'Success Plan targets' },
  { id: 'changelog', num: '19', title: 'Changelog' },
]

// Every rule-change entry is its own deep-link target (#1400), owned by §10.
// Module-scope so the map identity is stable across renders.
const RULE_CHANGE_ANCHORS: ReadonlyMap<string, string> = new Map(
  PROGRAM_YEAR_RULE_CHANGES.map(c => [c.id, 'program-year-rule-changes'])
)
const RULE_CHANGE_GROUPS = ruleChangesByProgramYear()

// Module-scope so the codec's parse/serialize identity is stable — keeps
// useUrlState's memoised value and setter stable across renders.
const SECTION_ID_SET: ReadonlySet<string> = new Set(SECTIONS.map(s => s.id))
const EMPTY_OPEN: ReadonlyArray<string> = []
const OPEN_SECTIONS_OPTS = {
  parse: parseOpenSections(SECTION_ID_SET),
  serialize: serializeOpenSections,
}

const MethodologyPage: React.FC = () => {
  useDocumentTitle('Methodology')

  // On mobile each H2 section collapses by default; desktop is untouched
  // (useIsMobile is false in jsdom too, so the static-content tests still
  // see the full page). #877.
  const isMobile = useIsMobile()

  // Which sections are open is URL state (#981): `?openSections=a,b` round-trips
  // through reload / back / share. The parse whitelists ids against
  // SECTION_ID_SET, so a hand-edited/shared URL can't seed a phantom open id
  // (Lesson 144 — the seed path bypasses the toggle's own guards).
  const [openSections, setOpenSections] = useUrlState<string[]>(
    OPEN_SECTIONS_PARAM,
    EMPTY_OPEN as string[],
    OPEN_SECTIONS_OPTS
  )
  const openIds = useMemo(() => new Set(openSections), [openSections])

  const toggle = useCallback(
    (id: string) => {
      setOpenSections(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      )
    },
    [setOpenSections]
  )

  // A TOC anchor (and the fragment-on-mount directive below) must reveal its
  // target — otherwise the jump lands on a collapsed heading and the reader
  // sees nothing below it. Idempotent: re-expanding an open section is a no-op.
  const expand = useCallback(
    (id: string) => {
      setOpenSections(prev => (prev.includes(id) ? prev : [...prev, id]))
    },
    [setOpenSections]
  )

  // Fragment as an on-mount directive: a shared `/methodology#borda-count` link
  // expands that section and scrolls to it. A rule-change entry anchor
  // (`#py-2026-2027-…`, #1400) expands its owning section and scrolls to the
  // entry — expanding is what makes it reachable, since the section is
  // collapsed on mobile. The whitelist in resolveHashTarget means an unknown
  // `#bogus` is a no-op. setOpenSections is this page's only URL writer, so
  // there's no same-batch sibling to race (Lesson 070 N/A here). Keyed on the
  // hash so a deep-link mount fires exactly once per fragment.
  const { hash } = useLocation()
  useEffect(() => {
    const target = resolveHashTarget(hash, SECTION_ID_SET, RULE_CHANGE_ANCHORS)
    if (!target) return
    const { sectionId, scrollToId: id } = target
    expand(sectionId)
    // Scroll after the expand paints. scrollIntoView (unlike the native locked
    // hash scroll) honours scroll-margin-top on .methodology-section, so the
    // heading clears the sticky chip bar (Lessons 138/139). Double rAF lets the
    // newly-revealed content lay out first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView?.({ behavior: 'auto', block: 'start' })
      })
    })
  }, [hash, expand])

  return (
    <div className="methodology-page">
      <header className="methodology-page__header">
        <p className="placeholder-page__eyebrow">Reference · Updated 2026-08</p>
        <h1 className="placeholder-page__title">Methodology</h1>
        {/* "What does this page answer?" lede (#879). One scannable sentence
            above the section list so a (mobile) reader can decide whether to
            dive into the ~16,000px of prose below. Replaces the older generic
            intro — see docs/design/mobile-ux-audit-2026-05-28.md §14. */}
        <p className="long-text-lede" data-testid="methodology-lede">
          Where Toast Stats gets its numbers, how districts and regions are
          ranked, and what every DCP tier and club-health label means — defined
          once, from public data, here.
        </p>
      </header>

      {/* Mobile-only sticky chip: re-open the TOC as a sheet without scrolling
          back to the top (#878). Reuses `expand` so a jump reveals the
          collapsed target section. Desktop keeps the in-flow TOC card below. */}
      {isMobile && <JumpToChip sections={SECTIONS} onJump={expand} />}

      <nav aria-label="On this page" className="methodology-toc">
        <p className="methodology-toc__title">On this page</p>
        <ol className="methodology-toc__list">
          {SECTIONS.map(s => (
            <li key={s.id} className="methodology-toc__item">
              <span className="methodology-toc__num">{s.num}</span>
              <a
                href={`#${s.id}`}
                className="methodology-toc__link"
                onClick={() => expand(s.id)}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <CollapsibleSection
        id="data-source"
        num="01"
        title="Data source & access"
        collapsible={isMobile}
        open={openIds.has('data-source')}
        onToggle={toggle}
      >
        <p>
          All numbers come from the public{' '}
          <a
            href="https://dashboards.toastmasters.org"
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            Toastmasters International dashboard
          </a>{' '}
          — the same files district leadership uses internally. Toast Stats
          pulls the published CSVs (district-performance, club-performance,
          payments, education awards), validates them against the contract
          schemas, and stores per-day snapshots in a public read-only CDN.
        </p>
        <p>
          Nothing private. Nothing scraped. If TI changes the column names or
          stops publishing a file, the pipeline fails loudly rather than
          silently inferring values.
        </p>
        <p className="methodology-source">
          Prefer asking an AI? The same public snapshots are exposed through a
          local read-only MCP server — see{' '}
          <Link to="/mcp" className="methodology-link">
            MCP Server
          </Link>{' '}
          for the one-command install.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="refresh-cadence"
        num="02"
        title="Refresh cadence"
        collapsible={isMobile}
        open={openIds.has('refresh-cadence')}
        onToggle={toggle}
      >
        <p>
          The data pipeline runs once daily at 08:00 UTC (4 AM EST / 5 AM EDT),
          with an 11:00 UTC backup run — the schedule lives in{' '}
          <code>.github/workflows/data-pipeline.yml</code>. Each run pulls the
          latest TI CSVs, transforms them, computes rankings + analytics, and
          writes a dated snapshot to GCS. Frontend serves the most recent
          snapshot via the CDN with a 5-minute stale-while-revalidate cache.
        </p>
        <p>
          Stale-data indicator: every page surfaces a "Data fresh ·
          &lt;date&gt;" pill so you always know which snapshot you're seeing.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="borda-count"
        num="03"
        title="Borda count scoring"
        collapsible={isMobile}
        open={openIds.has('borda-count')}
        onToggle={toggle}
      >
        <p>
          Each district is ranked separately in three categories:
          <strong> Paid Clubs</strong>, <strong>Total Payments</strong>, and{' '}
          <strong>Distinguished Clubs</strong>. Points are awarded based on rank
          position — with N districts, rank #1 receives N points, rank #2
          receives N−1, and so on down to 1 point for last place.
        </p>
        <p>
          The <strong>Aggregate Score</strong> shown on the District Rankings
          page is the sum of points across all three categories. With 117
          districts: a district ranked #5 / #3 / #8 earns 113 + 115 + 110 = 338
          points (higher is better). This is the standard Borda count method; it
          weights all three categories equally.
        </p>
        <p className="methodology-source">
          See the live{' '}
          <Link to="/awards" className="methodology-link">
            District Awards leaderboards
          </Link>{' '}
          for the three competitive recognitions ranked from this data:
          President's Extension, President's 20-Plus, and District Club
          Retention.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="regions-borda"
        num="04"
        title="Region-level scoring"
        collapsible={isMobile}
        open={openIds.has('regions-borda')}
        onToggle={toggle}
      >
        <p>
          The{' '}
          <Link to="/regions" className="methodology-link">
            Regions overview
          </Link>{' '}
          ranks all 14 numbered Toastmasters regions using the same Borda count
          method described above for districts, but with{' '}
          <strong>per-region growth-percent values</strong> in three categories:
        </p>
        <ul>
          <li>
            <strong>Paid Clubs growth</strong> — sum of paid clubs across the
            region's districts, divided by the sum of paid-club bases, minus
            one.
          </li>
          <li>
            <strong>Payments growth</strong> — sum of total payments across the
            region's districts, divided by the sum of payment bases, minus one.
          </li>
          <li>
            <strong>Distinguished share</strong> — sum of distinguished clubs
            across the region, divided by the sum of paid-club bases.
          </li>
        </ul>
        <p>
          Regions are ranked separately in each category. With N=14 regions,
          rank #1 in a category gets 14 points, rank #14 gets 1. The region
          <strong> aggregate score</strong> is the sum of points across the
          three ranks — a number between 3 and 42. This mirrors the district
          aggregate above so the framing transfers, and (unlike a raw sum of
          district scores) it{' '}
          <em>isn't biased by how many districts a region happens to have</em>.
        </p>
        <p className="methodology-source">
          Implementation: <code>frontend/src/utils/aggregateRegions.ts</code> (
          <code>rankBy</code>). Tested in{' '}
          <code>frontend/src/utils/__tests__/aggregateRegions.test.ts</code>.
          The DNAR sentinel (district-not-assigned-region) is excluded from the
          ranking; its districts surface as a footnote on{' '}
          <Link to="/regions" className="methodology-link">
            /regions
          </Link>{' '}
          only when non-zero.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="dcp-tiers"
        num="05"
        title="DCP tier definitions"
        collapsible={isMobile}
        open={openIds.has('dcp-tiers')}
        onToggle={toggle}
      >
        <p>Distinguished Club Program tiers, in ascending order:</p>
        <ul>
          <li>
            <strong>Distinguished</strong> — 5 of 10 DCP goals AND (20+ paid
            members OR net growth ≥ 3).
          </li>
          <li>
            <strong>Select Distinguished</strong> — 7 of 10 goals AND (20+ paid
            members OR net growth ≥ 5).
          </li>
          <li>
            <strong>President's Distinguished</strong> — 9 of 10 goals AND 20+
            paid members. <em>No growth alternative.</em>
          </li>
          <li>
            <strong>Smedley Distinguished</strong> — 10 of 10 goals AND 25+ paid
            members. <em>No growth alternative.</em> New for the 2025-2026
            program year.
          </li>
        </ul>
        <p>
          Two of these rules moved recently: goals 2 and 3 gained an{' '}
          <a
            href="#py-2026-2027-dcp-goals-2-3-eom"
            className="methodology-link"
            onClick={() => expand('program-year-rule-changes')}
          >
            alternative completion route in 2026-27
          </a>
          , and the Smedley club rung{' '}
          <a
            href="#py-2025-2026-smedley-distinguished-club"
            className="methodology-link"
            onClick={() => expand('program-year-rule-changes')}
          >
            did not exist before 2025-26
          </a>
          . Both make year-over-year comparisons something other than
          like-for-like — see §10.
        </p>
        <p>
          The 10 DCP goals are <strong>independent</strong>, not sequential — a
          club can achieve goals in any order. Toast Stats reads the raw
          per-goal columns from <code>club-performance.csv</code> rather than
          inferring from a single "goals achieved" count.
        </p>
        <p className="methodology-source">
          Source: <code>docs/toastmasters-rules-reference.md</code> §3.2 /
          Toastmasters Distinguished Club Program documentation. The
          determination logic lives in{' '}
          <code>frontend/src/utils/dcpProjections.ts</code> (
          <code>determineLevel</code>).
        </p>
        <p className="methodology-source">
          The{' '}
          <Link to="/awards" className="methodology-link">
            President's 20-Plus Award leaderboard
          </Link>{' '}
          ranks districts by the percentage of active clubs achieving 20+ paid
          members (Item 1490). Suspended and ineligible clubs are not counted
          toward the 20+ total, whatever their membership.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="club-health"
        num="06"
        title="Club health classifications"
        collapsible={isMobile}
        open={openIds.has('club-health')}
        onToggle={toggle}
      >
        <p>
          Toast Stats classifies each club into one of three mutually exclusive
          health statuses, recomputed every snapshot from the current data
          (never persisted as a property of the club):
        </p>
        <ul>
          <li>
            <strong>Thriving</strong> (<code>thriving</code>) — meets all three:
            <ul>
              <li>
                20+ paid members OR net growth ≥ 3 since program-year base
              </li>
              <li>On track for the program-month DCP checkpoint</li>
              <li>
                Club Success Plan (CSP) submitted —{' '}
                <a
                  href="#py-2025-2026-club-success-plan-required"
                  className="methodology-link"
                  onClick={() => expand('program-year-rule-changes')}
                >
                  2025-26 onward
                </a>
              </li>
            </ul>
          </li>
          <li>
            <strong>Vulnerable</strong> (<code>vulnerable</code>) — at least one
            of the three Thriving requirements is unmet, but the club has not
            crossed the intervention threshold below.
          </li>
          <li>
            <strong>Intervention Required</strong> (
            <code>intervention-required</code>) — paid members &lt; 12 AND net
            growth &lt; 3 since program-year base. This rule overrides all other
            criteria.
          </li>
        </ul>
        <p>
          <strong>Club Success Plan completion.</strong> From 2025-26 the
          Divisions, Division and Area narratives, the action list and the
          district overview state how many clubs have submitted a plan and name
          the active clubs that have not, because no club can be Distinguished
          without one. The plan has a per-club due date, from the Distinguished
          Club Program: an existing club must submit by{' '}
          <strong>30 September</strong>; a club chartered during the program
          year has <strong>90 days after its charter date</strong>; and a club
          chartered after 1 April automatically receives credit for that year,
          so it is footnoted rather than listed and counts on neither side of
          the ratio. A club that has not filed by its due date cannot earn
          Distinguished recognition for that program year, however many goals it
          meets &mdash; so before the date the wording names it, and from the
          day after it the wording says the eligibility is lost. That switch
          follows the snapshot date you are viewing, not today&apos;s calendar,
          so a historical snapshot reads as it did on its date. Two caveats when
          reading the counts: the dashboard&apos;s CSP column resets to
          &ldquo;not submitted&rdquo; for nearly every club on July 1, so
          early-year figures are low by construction, not a regression; and
          because Toastmasters&apos; program-year rollover lags July 1, a July
          snapshot can still reflect the prior year&apos;s June close. Years
          before 2025-26 have no CSP column and show no completion sentence at
          all &mdash; never &ldquo;0 of N submitted&rdquo; for a year with no
          requirement.
        </p>
        <p className="methodology-source">
          Source:{' '}
          <code>
            packages/analytics-core/src/analytics/ClubHealthAnalyticsModule.ts
          </code>{' '}
          (lines 316–360); type definition in{' '}
          <code>packages/shared-contracts/src/types/club-health-status.ts</code>
          . The DCP checkpoint progression by program month lives in the same
          analytics module. Toast Stats health is a project-specific overlay,
          not an official Toastmasters International metric.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="district-membership-trend"
        num="07"
        title="District Membership Trend"
        collapsible={isMobile}
        open={openIds.has('district-membership-trend')}
        onToggle={toggle}
      >
        <p>
          The chart on the District Detail · Trends tab plots a single metric:
          the district&apos;s <strong>total paid members</strong> at each
          snapshot date during the selected program year (Jul 1 – Jun 30).
        </p>
        <ul>
          <li>
            <strong>Source.</strong> The raw value comes from the Toastmasters
            District Performance dashboard — the same source the Toastmasters
            International office uses for monthly published rankings.
          </li>
          <li>
            <strong>Snapshot frequency.</strong> Toast Stats prunes to one
            snapshot per month (typically the last business day&apos;s data).
            Daily snapshots before pruning are not retained.
          </li>
          <li>
            <strong>Program-year scope.</strong> The x-axis is the whole program
            year, July to June. The selected program year is the solid line;
            while it is in progress it stops at the latest snapshot. Its line
            starts on July 1 from the prior year&apos;s June 30 close, because
            Toastmasters publishes the new year&apos;s first figures late in
            July. Use the program-year selector to inspect prior years.
          </li>
          <li>
            <strong>Comparison series.</strong> Each prior program year is drawn
            in full as a faint dashed line, aligned by position in the program
            year, so the same date sits at the same point on the axis for every
            year.
          </li>
          <li>
            <strong>Y-axis.</strong> &quot;Paid Members&quot; — count of members
            with current paid memberships, NOT a payment count (members
            typically pay twice per year, so payment count ≈ 2× member count
            over a full year).
          </li>
        </ul>
        <p>
          Growth and decline period overlays in the chart are computed from
          consecutive month-over-month deltas; the threshold and detection logic
          live in <code>frontend/src/components/MembershipTrendChart.tsx</code>.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        id="glossary"
        num="08"
        title="Glossary"
        collapsible={isMobile}
        open={openIds.has('glossary')}
        onToggle={toggle}
      >
        <dl className="methodology-glossary">
          <dt>Paid Club</dt>
          <dd>
            A club with at least 8 paid members that has met its renewal
            obligations (October &amp; April cycles).
          </dd>
          <dt>Paid Club Base</dt>
          <dd>
            A district's paid-club count at the start of the program year (July
            1) — the denominator for retention.
          </dd>
          <dt>New Charter</dt>
          <dd>
            A club chartered during the current program year. Counts toward the
            President's Extension Award but not toward retention. The year-end
            close is published in July but still counts charters from the
            program year it closes. Retention can exceed 100% only when clubs
            outside the base (for example, reinstated after a prior-year
            suspension) are paid at year-end.
          </dd>
          <dt>Distinguished Percent</dt>
          <dd>
            (Distinguished + Select + President's + Smedley clubs) ÷ club base —
            the paid clubs at the start of the program year (Item 1490), not the
            current paid-club count.
          </dd>
          <dt>Aggregate Score</dt>
          <dd>
            Sum of Borda points across paid clubs, payments, and distinguished.
            See{' '}
            <a href="#borda-count" className="methodology-link">
              §03
            </a>
            .
          </dd>
        </dl>
      </CollapsibleSection>

      <CollapsibleSection
        id="caveats"
        num="09"
        title="Caveats & known issues"
        collapsible={isMobile}
        open={openIds.has('caveats')}
        onToggle={toggle}
      >
        <ul>
          <li>
            <strong>Pre-2019 data</strong> — Toast Stats only stores snapshots
            from PY 2019–20 onward. Earlier seasons live in TI's own archive.
          </li>
          <li>
            <strong>Mid-PY restatements</strong> — TI occasionally republishes
            corrected files. Toast Stats keeps the latest published version and
            does not back-fill prior days; small day-over-day deltas occur
            during corrections.
          </li>
          <li>
            <strong>Charter date parsing</strong> — historical charter dates in{' '}
            <code>district-performance.csv</code> use a 2-digit year format (
            <code>04/15/26</code>); the parser explicitly handles this. See{' '}
            <code>tasks/lessons.md</code> Lesson 47 for context.
          </li>
          <li>
            <strong>Ties in the Top-3 awards</strong> — Toastmasters names three
            winners for each of the Extension, 20-Plus and Club Retention
            awards, but TI&apos;s tie-break isn&apos;t published. Toast Stats
            does not invent one: districts with exactly equal values share a
            rank, and when a tie reaches into the top three every tied district
            is shown as a co-winner, labelled <em>tied</em> on the{' '}
            <Link to="/awards" className="methodology-link">
              District Awards leaderboards
            </Link>
            . Ties are most common in Club Retention, where several districts
            can reach 100%. Values display to one decimal place; ranking uses
            the unrounded values.
          </li>
          <li>
            <strong>Leadership Excellence</strong> — the District Leadership
            Excellence Award goes to districts that are Distinguished (any tier)
            for three or more consecutive years (Item 1490). The award year
            itself counts toward the streak, so a district Distinguished in
            2023–24, 2024–25 and 2025–26 receives the 2025–26 award. During the
            year, a district with two prior consecutive years that is currently
            tracking Distinguished is shown as on track. It is shown as a
            recipient only once the year-end close is in. For 2025–26 the rule
            names Districts 104, 59, 88 and 71, which match TI&apos;s published
            list, plus Districts 94, 109 and 93. All three were Smedley in
            2025–26 and Distinguished in both prior years, but TI did not list
            them. Item 1490 doesn&apos;t explain why, and District 94 was listed
            in both of the previous two years. Toast Stats shows the published
            rule and does not guess at an unpublished one.
          </li>
        </ul>
      </CollapsibleSection>

      {/* Program-year rule changes (#1400). Toastmasters moves the recognition
          rules between years; without this a reader comparing two years has no
          way to know the numbers were not measured the same way. Entries are
          rendered from `content/programYearRuleChanges.ts`, which a guard test
          holds against the year-conditional code — see that module's header. */}
      <CollapsibleSection
        id="program-year-rule-changes"
        num="10"
        title="Program-year rule changes"
        collapsible={isMobile}
        open={openIds.has('program-year-rule-changes')}
        onToggle={toggle}
      >
        <p>
          Toastmasters changes the recognition rules between program years, so
          two years are not always measuring the same thing. Toast Stats scores
          each program year against <em>that year&apos;s</em> rules and never
          restates history — these are the changes that make a year-over-year
          comparison something other than like-for-like. Newest first; every
          entry has its own link you can share.
        </p>
        {RULE_CHANGE_GROUPS.map(group => (
          <section key={group.programYear} className="rule-change-year">
            <h3 className="rule-change-year__title">
              Program year {group.programYear}
            </h3>
            <ul className="rule-change-list">
              {group.changes.map(change => (
                <li key={change.id} id={change.id} className="rule-change">
                  <h4 className="rule-change__title">
                    <a
                      href={`#${change.id}`}
                      className="rule-change__permalink"
                      onClick={() => expand('program-year-rule-changes')}
                    >
                      {change.title}
                    </a>
                  </h4>
                  <p className="rule-change__affects">
                    <span className="rule-change__label">Affects</span>
                    {change.affects}
                  </p>
                  <p>{change.whatChanged}</p>
                  <p className="rule-change__impact">
                    <span className="rule-change__label">
                      Comparing across the boundary
                    </span>
                    {change.comparability}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="methodology-source">
          Sourced from{' '}
          <code>frontend/src/content/programYearRuleChanges.ts</code>, which
          names the code implementing each change; a guard test fails the build
          when the code gains a program-year rule branch this log does not know
          about. Underlying rules:{' '}
          <code>docs/toastmasters-rules-reference.md</code> §3.3, §10.2, §13.
        </p>
      </CollapsibleSection>

      {/* Worldwide rollup (#1500, epic #1496 Sprint 4). The /history
          scoreboard links here; this section is where its bases are stated.
          The operator ruling of 2026-08-31 is "publish our numbers with our
          definitions stated", which only works if the definitions are
          actually on the page — so the ruled wording below is asserted by
          MethodologyPage.worldwideRollup.test.tsx and should not be
          paraphrased without re-reading #1426. */}
      <CollapsibleSection
        id="worldwide-rollup"
        num="11"
        title="Worldwide rollup"
        collapsible={isMobile}
        open={openIds.has('worldwide-rollup')}
        onToggle={toggle}
      >
        <div data-testid="methodology-worldwide-rollup">
          <p>
            The worldwide scoreboard on{' '}
            <Link to="/history" className="methodology-link">
              Program Year History
            </Link>{' '}
            rolls every district up into one row per completed program year.
            These are <strong>our</strong> numbers computed to{' '}
            <strong>our</strong> stated definitions. Toastmasters International
            publishes its own worldwide figures in the CEO Report; where ours
            line up with those, we treat it as{' '}
            <strong>validation, never a target</strong> — we do not fit a
            definition to make a published number reproduce.
          </p>

          <h3>What is counted</h3>
          <p>
            Each program year is rolled up at its own year-end snapshot, over
            the{' '}
            <strong>district set that date's own rankings file lists</strong> —
            a snapshot folder can legitimately hold districts that did not exist
            on that date, and those are excluded. Every club is counted{' '}
            <strong>once</strong>, on its canonical club id.
          </p>
          <p>
            <strong>Undistricted clubs (district “U”) are included</strong> in
            every membership, payment and club figure — they are real clubs with
            real members. They are not a district, so the district count is
            stated separately as “N + undistricted” rather than folded in. That
            is why our district count can read one lower than the row count of
            the underlying file.
          </p>

          <h3>Membership</h3>
          <p>
            Our primary membership basis is the <strong>June 30</strong> sum of
            active members across every in-scope club. Toastmasters
            International publishes its “total membership” on a{' '}
            <strong>March 31</strong> basis, so we carry that figure alongside
            in its own row and label both. Neither is ever substituted for the
            other. A program year with no March-31 rollup on file shows a marked
            gap, not a zero.
          </p>
          <p>
            <strong>Average club size = June-30 membership ÷ paid clubs</strong>
            , both taken at June 30. This is a ruled basis: TI's own published
            average is not its published membership divided by its published
            club count, so the divisor it uses differs from the one it prints.
            We state ours rather than reverse-engineering theirs.
          </p>

          <h3>Recognition</h3>
          <p>
            Club tiers are summed from each year-end rankings file, where
            “Distinguished clubs” means <em>distinguished or better</em>;
            Select, President's and Smedley are subsets of it, and the plain
            Distinguished rung is the remainder. District recognition is scored
            under the ruleset of the program year the snapshot date belongs to,
            never under current rules, and “U” is not scored because
            undistricted clubs belong to no district.
          </p>
          <p>
            <strong>
              Smedley Distinguished did not exist before program year 2025-2026
            </strong>
            . Earlier years show it as not applicable. Archived files store a
            literal 0 for those years, and echoing that would claim no club
            reached a rung that was not on the ladder — so it is rendered as an
            absence. It is <strong>not zero clubs</strong>.
          </p>

          <h3>New clubs — two different metrics</h3>
          <p>
            <strong>New clubs still active at year end</strong> is our own
            basis: clubs chartered during the program year that still had a
            roster row at June 30. It undercounts charters that lapsed before
            the close, and it diverges most in a bad year, which is exactly why
            it never carries the bare name “new clubs”.
          </p>
          <p>
            <strong>New clubs (report basis)</strong> is Toastmasters' own
            count, taken from the New Clubs report. Our pipeline only carries
            that report from program year <strong>2026-2027</strong> onward, so
            earlier years have no report-basis figure at all. The two rows are
            different metrics and are never substituted for one another.
          </p>

          <h3>Education awards</h3>
          <p>
            Education counts <strong>raw achievement activity</strong> for the
            year — Levels 1-5, DTM, and a published “other” bucket for award
            codes that are neither — summed from the education reports. It is{' '}
            <strong>not DCP credit</strong>: DCP education credit counts
            distinct members per award tier, and member identity is dropped at
            parse time, so the two can never be reconciled here. The DCP credits
            a club once per award type per member: three Level 1s by one member
            earn one DCP credit, whereas the education count here counts every
            award, so it records three. A year whose report set is not on file
            is marked as such and never zero-filled.
          </p>

          <h3>Clubs by country</h3>
          <p>
            Published from the <strong>latest snapshot only</strong>, never as a
            five-year series: club-to-country enrichment thins out sharply on
            historical year-end files, so a country trend would describe our own
            coverage rather than Toastmasters. Clubs with no country match are
            published as an explicit <strong>Unknown</strong> row, so every
            share is a share of a stated whole. Country is a club-level fact; we
            deliberately publish no members-by-country or awards-by-country,
            which would be proxies rather than measurements.
          </p>

          <p className="methodology-source">
            Sources: <code>v1/global-history.json</code> (one row per completed
            program year) and{' '}
            <code>snapshots/&#123;date&#125;/global-totals.json</code> (one
            date's worldwide rollup). Both are public artifacts on the same CDN
            as every other file this site reads.
          </p>
        </div>
      </CollapsibleSection>

      {/* Worldwide club race (#1556, operator rulings 2026-09-12). The /clubs
          pages and the club page's standing card link here; this is where the
          basis is stated. Ruling R-B: we call a club Distinguished when it
          meets the requirements, knowingly ahead of TI's April 30 stamp. The
          wording below is asserted by MethodologyPage.clubRace.test.tsx. */}
      <CollapsibleSection
        id="club-race"
        num="12"
        title="Worldwide club race"
        collapsible={isMobile}
        open={openIds.has('club-race')}
        onToggle={toggle}
      >
        <div data-testid="methodology-club-race">
          <p>
            <Link to="/clubs" className="methodology-link">
              Clubs worldwide
            </Link>{' '}
            shows which clubs in the world reached each Distinguished tier
            first, and when. Toast Stats{' '}
            <strong>
              recognises a club as Distinguished when it meets the requirements
            </strong>{' '}
            — DCP goals plus membership under the program year's rules, with a
            Club Success Plan where required — which{' '}
            <strong>may precede</strong> Toastmasters International's official
            recognition on April 30. We use the real tier names plainly
            (Distinguished, Select Distinguished, President's Distinguished,
            Smedley Distinguished). Clubs TI has already recognised carry a
            separate rosette.
          </p>

          <h3>Membership basis</h3>
          <p>
            Before April 1, active-member counts still include members who may
            not renew, so the membership requirement is read against{' '}
            <strong>confirmed April renewals</strong>; from April 1 it is read
            against <strong>active members</strong>. Expect a step change at
            April 1 as the basis switches — it is the renewal-basis switchover,
            not a single-day surge. Where the active-member reading is ahead of
            the confirmed one, the club page marks it "unconfirmed" — a
            qualifier, never a different name.
          </p>

          <h3>Crossing dates</h3>
          <p>
            A crossing is the <strong>first snapshot date</strong> on which the
            club met the tier's requirements. It is written once and{' '}
            <strong>never revised</strong>, even if the club later falls below
            the requirement; today's numbers are shown separately, without a
            "lost" label. Dates are snapshot dates, and "between A and B" means
            no snapshot was collected on the days in between — the site does not
            interpolate. Ranks are competition ranks (ties share a rank; the
            next rank skips), so every club over the line on the first observed
            date of a program year ties at first.
          </p>

          <h3>How clubs are counted</h3>
          <p>
            The lists and the counts answer different questions, so they do not
            match — deliberately. A club appears in{' '}
            <strong>every tier it has reached</strong>, because reaching
            President's Distinguished does not undo reaching Distinguished. In
            the tiles at the top of <Link to="/clubs">Clubs worldwide</Link>,
            each club is <strong>counted once</strong>, at the{' '}
            <strong>level it holds now</strong> — so a club at President's is
            not also counted under Select and Distinguished, and the four tiles
            add up to the number of clubs recognised. A club that falls back
            below a tier moves to the tile for its current level and{' '}
            <strong>keeps its crossing date and rank</strong> in the higher
            tier's list. The chart under the tiles bands the same clubs the same
            way.
          </p>

          <h3>What is never shown</h3>
          <p>
            There is <strong>no global list with a bottom</strong>. Every list
            on the clubs pages is a list of clubs that have reached a line; a
            club that has not reached anything appears nowhere on the global
            surface. A club's own page shows a private, cohort-based percentile
            ("top X % among clubs with 20–24 members"), never an absolute rank.
          </p>

          <p className="methodology-source">
            Sources: the collector's crossing store (
            <code>club-race/&#123;program year&#125;/first-reached.json</code>,
            captured daily) and{' '}
            <code>snapshots/&#123;date&#125;/global-club-race.json</code> (one
            date's projection). The tier rule is the same shared function the
            district pages use; see §05 for the thresholds.
          </p>
        </div>
      </CollapsibleSection>

      {/* Officer training (#2296) — the Training page, the Action List section
          and the division/area counts link here. Its own section: officer
          training is not part of the education program. Asserted by
          MethodologyPage.officerTraining.test.tsx. */}
      <CollapsibleSection
        id="officer-training"
        num="13"
        title="Officer training"
        collapsible={isMobile}
        open={openIds.has('officer-training')}
        onToggle={toggle}
      >
        <div data-testid="methodology-officer-training">
          <p>
            DCP goal 9 asks each club for{' '}
            <strong>4 or more officers trained in each round</strong>. Round 1
            runs June 1 – August 31 (it opens a month before its program year
            starts on July 1); Round 2 runs November 1 to the last day of
            February (February 29 in a leap year). The round dates come from one
            dated rules table, so a future change to the windows applies only
            from the program year it starts in.
          </p>
          <ul>
            <li>
              <strong>Source.</strong> The club performance export&apos;s{' '}
              <code>Off. Trained Round 1</code> and{' '}
              <code>Off. Trained Round 2</code> columns: for each club, the
              number of its seven officers trained in that round, 0–7. They are
              the same cells the club page&apos;s DCP goals panel reads.
            </li>
            <li>
              <strong>Count only, not which officers.</strong> Toastmasters
              International publishes how many officers were trained, not which
              roles. &quot;All seven officers&quot; means a count of 7; training
              by office is not available.
            </li>
            <li>
              <strong>Threshold.</strong> The default is 4 (DCP goal 9). Many
              districts run their own incentives, so any threshold from 1 to 7
              can be chosen; it is kept in the page address so a district&apos;s
              view can be shared.
            </li>
            <li>
              <strong>Which clubs.</strong> Every club on the club performance
              export is counted, whatever its status, so the percentages use the
              same club list the dashboard shows. The Action List&apos;s to-do
              of clubs short of training leaves out suspended and ineligible
              clubs and counts them in a footnote, as its Club Success Plan
              section does.
            </li>
            <li>
              <strong>The June gap.</strong> Toastmasters publishes the new
              program year&apos;s counts only after its late-July rollover. In
              June the snapshot still shows the previous year&apos;s final
              results while the new Round 1 is already open, so no &quot;clubs
              short&quot; list is built from it.
            </li>
            <li>
              <strong>Progress curve.</strong> The share of clubs at or above
              the threshold on each daily snapshot inside the round, this
              program year against last. Snapshots published before the figure
              was recorded have no point; the chart says where the record starts
              rather than drawing zeros. Older years were kept at month-ends
              only, so their curves are sparse.
            </li>
            <li>
              <strong>Region comparison.</strong> A region&apos;s districts are
              compared on the same figures, from one region rollup per date; a
              district&apos;s rank is its place among the districts with
              figures, at the selected threshold, on the open round (or the
              latest that has started).
            </li>
          </ul>
          <p className="methodology-source">
            Sources:{' '}
            <code>snapshots/&#123;date&#125;/district_&#123;id&#125;.json</code>{' '}
            (the club list), the district time series (
            <code>
              time-series/district_&#123;id&#125;/&#123;program year&#125;.json
            </code>
            , the curve) and{' '}
            <code>snapshots/&#123;date&#125;/region-rollups.json</code> (region
            comparisons).
          </p>
        </div>
      </CollapsibleSection>

      {/* Member-level data (#2302) — officers ask for member retention,
          per-member Pathways progress or officer names. None of it is here by
          design; this says so and why. The club page links here
          (ClubMemberDataNote). Asserted by MethodologyPage.memberData.test.tsx.
          Promise nothing: #1614 (member retention) is parked. */}
      <CollapsibleSection
        id="member-data"
        num="14"
        title="Member-level data"
        collapsible={isMobile}
        open={openIds.has('member-data')}
        onToggle={toggle}
      >
        <div data-testid="methodology-member-data">
          <p>
            Toast Stats shows clubs, areas, divisions, districts and regions. It
            does <strong>not</strong> show individual members: no member names
            or IDs, no contact details, no officer names, no per-member Pathways
            progress, no guest lists and no member-by-member retention. That is{' '}
            <strong>by design</strong>, not a gap.
          </p>
          <h3>Why</h3>
          <p>
            Privacy. Member records are personal data, and Toastmasters
            International shares them only with the officers entitled to see
            them. The public dashboards Toast Stats reads (§01) publish club,
            area, division and district totals, and Toast Stats keeps to those
            aggregates. It does not collect, infer or store anything about a
            person.
          </p>
          <h3>Where to find member-level data</h3>
          <p>
            Club officers can see their own club&apos;s roster and member
            records in{' '}
            <a
              href="https://www.toastmasters.org/my-toastmasters/profile/club-central"
              target="_blank"
              rel="noopener noreferrer"
              className="methodology-link"
            >
              Club Central
            </a>{' '}
            on toastmasters.org (sign-in required). What a club page here shows
            is the club&apos;s totals: its member count, membership payments,
            DCP goals and education awards.
          </p>
        </div>
      </CollapsibleSection>

      {/* Region District Recognition scoreboard (#2307) — the Region page's
          scoreboard links here. Asserted by
          MethodologyPage.regionRecognition.test.tsx. */}
      <CollapsibleSection
        id="region-recognition"
        num="15"
        title="Region District Recognition"
        collapsible={isMobile}
        open={openIds.has('region-recognition')}
        onToggle={toggle}
      >
        <div data-testid="methodology-region-recognition">
          <p>
            Each Region page shows, for every tier of the District Recognition
            Program (Distinguished, Select, President&apos;s and, from 2018-19,
            Smedley), how many of the region&apos;s districts meet it at the
            selected snapshot.
          </p>
          <ul>
            <li>
              <strong>Meeting a tier.</strong> A district meets a tier when its
              paid-club growth, payment growth and share of Distinguished clubs
              reach that tier&apos;s thresholds <em>and</em> it has met every
              prerequisite the program year requires, under that program
              year&apos;s own rules (District Recognition Program, Item 1490 and
              its revisions; see §10 for how the rules changed). It is the same
              tier the district page shows. Tiers are counted at that tier or
              higher, so a Select district also counts for Distinguished.
            </li>
            <li>
              <strong>Early in the year.</strong> Payments and Distinguished
              clubs build up through the program year, so few districts meet any
              tier before spring. &quot;Meet it today&quot; is what the district
              would earn if the year closed on that snapshot; the on-track line
              below is the forward-looking measure.
            </li>
            <li>
              <strong>Nearest district.</strong> For each tier, the district
              below it whose hardest metric is the smallest share of its base
              away (payments still needed against its payment base, paid clubs
              and Distinguished clubs against its club base), with the counts it
              still needs. A district whose metrics are met but is short of a
              prerequisite shows as &quot;metrics met, prerequisites
              outstanding&quot;.
            </li>
            <li>
              <strong>On track, based on last year&apos;s pace.</strong> Shown
              apart from &quot;meet it today&quot;. A district is on track for a
              tier when each of three ratios is at least the median of the
              districts that reached that tier or higher at the end of 2025-2026
              (their June 30 tier), measured on the same day of 2025-2026:
              <ul>
                <li>paid clubs ÷ club base</li>
                <li>payments ÷ payment base</li>
                <li>Distinguished clubs ÷ club base</li>
              </ul>
              Ratios to each district&apos;s own base, not raw counts: on
              2025-09-30 the districts that went on to reach Distinguished or
              higher ran from 45 to 207 paid clubs, so a median of counts
              measures district size, not pace (Smedley districts&apos; median
              was 86 paid clubs, below the 116.5 of all Distinguished-or-higher
              districts). The tiers themselves are set against the same bases.
              The median is used so that a few fast or slow districts do not set
              the bar.
            </li>
            <li>
              <strong>Same renewal period.</strong> Paid clubs drop when October
              and April renewals come due, so last year&apos;s figures are never
              taken from the other side of October 1 or April 1. The renewal
              periods are July 1 – September 30, October 1 – March 31 and April
              1 – June 30. When the same day was not kept, the page uses the
              nearest earlier snapshot in the same renewal period, otherwise the
              nearest later one in that period; if the period kept no snapshot,
              on track is shown as not available.
            </li>
            <li>
              <strong>Tiers nest.</strong> A district counts as on track for a
              tier only if it is also on track for every lower tier. Each
              tier&apos;s median comes from its own, small group of districts
              (11 reached Smedley in 2025-2026), so a higher tier&apos;s bar can
              sit slightly below a lower tier&apos;s; nesting keeps a higher
              tier from counting more districts than a lower one.
            </li>
            <li>
              <strong>Limits of the on-track line.</strong> It is a comparison
              with one past year, not a promise: last year&apos;s pace may not
              repeat, and the prerequisites are not part of it. 2025-26 was kept
              mostly at month-end until March, so the comparison day can be up
              to a month away from today&apos;s. Early in the year the
              Distinguished clubs median is often 0, so that ratio holds for
              every district. It is shown only for 2026-2027, the first year
              whose previous year has been checked after the Club Success Plan
              rule was applied to its Distinguished counts; for other years the
              page says it is not available.
            </li>
            <li>
              <strong>Unknown.</strong> A district whose metrics earn a tier but
              that has a required prerequisite not reported in its export is not
              counted as meeting it; the page counts these districts in a note.
            </li>
          </ul>
          <p className="methodology-source">
            Sources:{' '}
            <code>snapshots/&#123;date&#125;/competitive-awards.json</code>{' '}
            (each district&apos;s tier, and last year&apos;s June 30 tiers) and{' '}
            <code>snapshots/&#123;date&#125;/all-districts-rankings.json</code>{' '}
            (the counts and bases, this year&apos;s and on last year&apos;s
            reference date).
          </p>
        </div>
      </CollapsibleSection>

      {/* Council voting strength (#2300) — the council credentials page
          (/district/:id/council) links here. Asserted by
          MethodologyPage.councilVoting.test.tsx. */}
      <CollapsibleSection
        id="council-voting-strength"
        num="16"
        title="Council voting strength"
        collapsible={isMobile}
        open={openIds.has('council-voting-strength')}
        onToggle={toggle}
      >
        <div data-testid="methodology-council-voting">
          <p>
            Each district&apos;s council credentials page shows, for a council
            date, the clubs in good standing, their votes and the quorum. It is
            a pre-meeting cross-check for the Credentials Chair. It is derived
            from TI&apos;s public dashboard and is{' '}
            <strong>not TI&apos;s official credentials list</strong>: that is
            the District Council report in District Central (District Leadership
            Handbook, Item 222, p.87).
          </p>
          <h3>The rule</h3>
          <ul>
            <li>
              <strong>Who votes.</strong> The District Council includes the
              representatives of each Member Club in good standing, and each
              such club is entitled to two votes (District Administrative
              Bylaws, DAB Art. IX(a); the per-club maximum of two is DAB Art.
              X(d)). A club not in good standing has no voting privileges until
              it meets the requirements (DLH p.86).
            </li>
            <li>
              <strong>Good standing.</strong> A club is paid and in good
              standing when World Headquarters has received its dues for the
              current dues period for a minimum of eight (8) members, at least
              three (3) of whom were members during the previous renewal period
              (Policy 2.0 §4). Dues are due April 1 and October 1.
            </li>
            <li>
              <strong>Quorum.</strong> On the basis of two votes per club,
              one-third of the Member Clubs in good standing is a quorum (DAB
              Art. X(c)). The page shows that third rounded up to a whole club.
            </li>
          </ul>
          <h3>How the page applies it</h3>
          <ul>
            <li>
              <strong>TI&apos;s own status, not a recount.</strong> A club is in
              good standing when the dashboard&apos;s Club Status is{' '}
              <em>Active</em>. <em>Low</em> (fewer than 8 paid members this dues
              period), <em>Ineligible</em> and <em>Suspended</em> are not in
              good standing. The page never recomputes standing from member
              counts: a newly chartered club is entitled to vote once its
              charter is complete (DLH p.86), and TI shows such a club Active
              before it has any renewing members.
            </li>
            <li>
              <strong>The snapshot.</strong> The page uses the latest daily
              snapshot on or before the council date. Between snapshots a club
              can pay its dues and gain standing, so when the snapshot is more
              than 7 days older than the council date the page says so.
            </li>
            <li>
              <strong>The dues-period boundary.</strong> Every club&apos;s
              standing resets when a dues period opens on April 1 and October 1.
              If the nearest snapshot is from the previous period (for example a
              council on October 3 with data from September 30), the page shows
              no count and says why, rather than a count that can be 10 to 20
              clubs off.
            </li>
            <li>
              <strong>Future dates.</strong> For a council still to come, the
              page uses the latest snapshot and says that clubs paying before
              the meeting will gain standing.
            </li>
          </ul>
          <h3>What it cannot know</h3>
          <ul>
            <li>
              Dues TI posts after the snapshot, new clubs TI has not yet
              published, and WHQ actions the dashboard does not show.
            </li>
            <li>
              District Executive Committee members, who have one vote each (up
              to three with their club&apos;s votes, DAB Art. X(d)). There is no
              officer roster here, so the page counts club votes only.
            </li>
            <li>
              Who the voting members are. Toast Stats holds no member data
              (§14).
            </li>
            <li>
              The district&apos;s own credentials deadline (DLH p.87). Pick it
              as the council date if it differs from the meeting.
            </li>
          </ul>
        </div>
      </CollapsibleSection>

      {/* Club Growth prospective clubs (#2388) — the district funnel's
          Progress / Waiting on columns and the region and world "By
          progress" table. Asserted by MethodologyPage.clubGrowth.test.tsx. */}
      <CollapsibleSection
        id="club-growth-prospective"
        num="17"
        title="Prospective clubs"
        collapsible={isMobile}
        open={openIds.has('club-growth-prospective')}
        onToggle={toggle}
      >
        <div data-testid="methodology-club-growth-prospective">
          <p>
            The Club Growth funnel lists the clubs on TI&apos;s Prospective
            Clubs report. For each club the report prints a charter checklist:
            six steps (Application to Organize, Certificate &amp; Remit, Roster,
            Officer Info, Club Info, Constitution &amp; Bylaws) plus Payment,
            each marked Complete or Incomplete with a date.
          </p>
          <ul>
            <li>
              <strong>A checklist, not a ladder.</strong> Clubs do the steps in
              any order, and a step can go back to Incomplete. A step&apos;s
              date is when it last changed, not when it was completed. So
              Progress counts the steps marked Complete, whatever their number:
              &quot;5 of 6 steps complete&quot;.
            </li>
            <li>
              <strong>Waiting on.</strong> The incomplete step that last changed
              longest ago, and the days since it changed, as of the page&apos;s
              date. Ties go to the lower step number. When all six steps are
              complete, it says so.
            </li>
            <li>
              <strong>Steps TI does not list.</strong> TI often prints only the
              first step. A step it does not list yet is shown as &quot;not
              listed yet&quot; and counts from the checklist&apos;s most recent
              step date. A listed step with no date counts the same way.
            </li>
            <li>
              <strong>Order.</strong> Most steps complete first, then longest
              waiting.
            </li>
            <li>
              <strong>Region and world.</strong> The region and world funnels
              count prospective clubs by steps complete with the same reading,
              so a region&apos;s total is the sum of its district pages. Dates
              built before this reading show the older &quot;by stage&quot;
              grouping (the highest step TI lists, complete or not) and say so.
            </li>
          </ul>
          <p>
            Source: the <code>prospectiveClubs</code> section of{' '}
            <code>
              snapshots/&#123;date&#125;/district_&#123;id&#125;_reports.json
            </code>{' '}
            and, for regions and the world,{' '}
            <code>snapshots/&#123;date&#125;/reports-rollups.json</code>. The
            report&apos;s contact and location text are never shown.
          </p>
        </div>
      </CollapsibleSection>

      {/* District Success Plan targets (#2297) — the Overview panel and the
          Trends target line. Asserted by
          MethodologyPage.successPlanTargets.test.tsx. */}
      <CollapsibleSection
        id="success-plan-targets"
        num="18"
        title="Success Plan targets"
        collapsible={isMobile}
        open={openIds.has('success-plan-targets')}
        onToggle={toggle}
      >
        <div data-testid="methodology-success-plan-targets">
          <p>
            A district&apos;s leaders can enter the targets from their District
            Success Plan on the district Overview. They show as a{' '}
            <strong>Plan</strong> mark on the KPI cards, next to the
            Distinguished District thresholds, and as a dashed target line on
            the Trends payments chart.
          </p>
          <h3>The goal areas</h3>
          <p>
            The District Success Plan is organized around three goal areas:
            Membership Payments Growth, Club Growth and Distinguished Clubs (TI
            Item 431, <em>District Strategies Guide</em>, Rev. 05/2025, pp.5–6).
            Each target is a whole number the district sets for itself, measured
            by the KPI that tracks that goal area:
          </p>
          <ul>
            <li>
              <strong>Club Growth</strong>: paid clubs.
            </li>
            <li>
              <strong>Membership Payments Growth</strong>: membership payments
              this program year.
            </li>
            <li>
              <strong>Distinguished Clubs</strong>: Distinguished clubs.
            </li>
          </ul>
          <h3>Where the targets live</h3>
          <p>
            Only in the link. The targets are encoded in the{' '}
            <code>?targets=</code> query parameter (for example{' '}
            <code>?targets=c-105_d-60_p-4500_py-2026</code>), so Copy link
            shares them. There is no account and nothing is saved on a server or
            in the browser. Within one browser tab they stay with the district
            as you move between its pages, the same way the selected program
            year does.
          </p>
          <p>
            Targets come from whoever made the link,{' '}
            <strong>not from Toastmasters International</strong>. Anyone can
            make a link with any numbers. Each link is bound to one program year
            (<code>py</code>), so an old link never marks this year&apos;s
            cards. A malformed or unrecognized value is ignored.
          </p>
          <p className="methodology-source">
            Sources: the link&apos;s <code>?targets=</code> parameter (the
            targets) and the district&apos;s <code>performance-targets</code>{' '}
            and time-series files (the actual values).
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="changelog"
        num="19"
        title="Changelog"
        collapsible={isMobile}
        open={openIds.has('changelog')}
        onToggle={toggle}
      >
        <p>
          Material methodology changes are recorded as ADRs in{' '}
          <code>docs/architecture-decisions/</code> and as releases on{' '}
          <a
            href="https://github.com/taverns-red/toast-stats/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            GitHub Releases
          </a>
          . Recent notable updates:
        </p>
        <ul>
          <li>
            <strong>2026-04</strong> — Retention award formula split from
            Extension to count only base-club survival (excludes new charters).
            #336.
          </li>
          <li>
            <strong>2026-04</strong> — Distinguished District tier tracking
            added; per-district trophy case on the District page. #332.
          </li>
          <li>
            <strong>2026-05</strong> — 2026 redesign: new chrome (top bar,
            footer, panels), token system migration, dark-mode-aware surfaces.
            Epic #352.
          </li>
        </ul>
      </CollapsibleSection>

      {/* #2090 — who makes Toast Stats, and the district voting tool. */}
      <RedVoteMadeByLine
        placement="methodology"
        className="methodology-page__made-by"
        linkClassName="methodology-link"
      />
    </div>
  )
}

export default MethodologyPage
