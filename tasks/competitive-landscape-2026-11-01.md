# Toast Stats: competitive landscape update (2026-11-01)

Baseline: `tasks/pm-memo-2026-06-21.md` §1. Method: web re-verification of every
baseline competitor (searches plus direct fetches and HTTP status checks on
2026-11-01), a GitHub search for new projects, and the repo history
(`git log --since=2026-06-21 origin/main`, 647 commits). Where a fact could not be
verified, it says so. Sources are summarised in our own words.

---

## 1. What changed since June

**Market side**

1. **TI's 2026-27 realignment changed the shape of the data.** The district list on
   `dashboards.toastmasters.org` now includes a 201–231 series (204 absent) alongside
   the surviving numbers. One independent project counts 94 current districts, 68
   dissolved and 30 new. **That count is not confirmed by TI.** TI's realignment pages
   confirm the process and the July 1, 2026 effective date, and give examples of
   districts that were merged or renumbered.
   Sources: https://dashboards.toastmasters.org/ ,
   https://www.toastmasters.org/membership/leadership/districtrealignment/districtmaps ,
   https://www.toastmasters.org/footer/faq/District-Realignment ,
   https://toastmasters.org/membership/leadership/region-realignment
2. **TI absorbed the Raffety Report.** Since September 15, 2026, a new **District
   Summary Report** has gone out by email through the Weekly Email Subscriptions card
   in District Central. TI says it "replaces the report commonly known as" the
   Raffety Report. TI's own spelling is inconsistent: "Rafferty" in September,
   "Raffety" in October. Only current district leaders and Region Advisors can
   subscribe, and TI has published nothing about what the report contains.
   Sources: https://www.toastmasters.org/membership/leadership/the-leader-letter/Leader-Letter-September-2026/District-News-September-2026 ,
   https://www.toastmasters.org/membership/leadership/the-leader-letter/Leader-Letter-October-2026/District-News-October-2026
3. **Reports2/Reports3 is gone.** `reports2.toastmasters.org` now 301-redirects to
   the toastmasters.org home page, and deep links such as `District.cgi` redirect to
   a 404. Search-engine snippets of its last notice say data collection stopped with
   the 2024-25 final numbers and the site would go offline in late 2025.
4. **The TI dashboard itself has not been redesigned.** It still offers tables and
   CSV export, with a program-year picker from 2008-09 to 2026-27 and no charts,
   trends, maps or projections. The footer reads "Recognition Version 2.0". The only
   new TI data surface we found is a District Recognition Program dashboard linked
   from the Distinguished Performance Reports page, plus a Path Completion correction
   in March 2026.
5. **There is still no public TI API and no TI AI tooling.** We found no documented
   API, and no TI-built analytics or AI for district leaders. Base Camp changes in
   2026 were about content (Vintage Paths in April, "Explorations" on August 4), not
   analytics. Sources: https://www.toastmasters.org/education/pathways/pathways-updates ,
   https://www.toastmasters.org/resources/statistics-and-data-hub (static infographics only)
6. **A real new entrant appeared: `tm-dcp` "Club Health Board"** (created
   2026-09-23). It covers every district, including the dissolved ones, with five
   years of DCP history, a clustered club map and an area-director Excel workbook.
   It is the closest thing to Toast Stats we have found. See §2.

**Toast Stats side.** All four gap-closing features from June shipped within days of
the memo, and the scope then grew far past them: maps, regions and world views,
training, education, growth funnels, council tooling, share cards, success-plan
targets, prospective clubs, videos and the MCP server. Details in §3.

7. **A second, stronger competitor: the Devin Pearson "Toastmasters Dashboard"**
   (reports.devinpearson.me), added on review.
   It is the closest like-for-like product: every district, region and global
   level, daily-current data, Distinguished District gap math, a monthly task
   timeline, per-club change logs and hypothetical area/division planners. It
   overlaps much more with Toast Stats than tm-dcp does. See §2 and §4.6. Of the
   nine features the first draft said we lack, we already **have** four,
   **partly have** four, and **lack** one (translation); see §4.6.

### June gap features: status

| #   | June gap feature                                   | Status                 | Evidence                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | At-a-glance club grid (Chiclet/LEO board)          | **Shipped**            | #1230 → PR #1237 (`/district/:id/grid`); phone version #1845 → #1902                                                                                                                                                                                                     |
| 2   | Per-club multi-year history                        | **Shipped** (extended) | #1229 → #1235; district resolved per year #1803/#1804 → #2068/#2067; lifecycle timeline #2057, #2170; multi-year membership #1955                                                                                                                                        |
| 3   | "Almost Distinguished" / Area Director action list | **Shipped** (extended) | #1231 → #1239 (`/district/:id/action-list`); CSP section #1561; collapsible sections #1571/#1578; next-deadline strip #2298 → #2351. The opt-in per-area **digest** in #2298 is **not done**: it was left for product review, and #257 was closed earlier as speculative |
| 4   | DCP per-goal "what's missing"                      | **Shipped** (restored) | #1227 → #1234                                                                                                                                                                                                                                                            |

---

## 2. Competitor table (verified 2026-11-01)

| Competitor                                                                      | What it is                                                                                                                                                                            | Strength                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Weakness vs Toast Stats                                                                                                                                                                                                                                                                                            | Status (as of 2026-11-01)                                                                         | Source                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TI Dashboards**                                                               | The official daily performance tables, by district, division/area and club                                                                                                            | Authoritative; every district; history back to 2008-09; CSV export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Still raw tables. No trends, projections, maps, health flags or dark mode                                                                                                                                                                                                                                          | Live. No redesign seen. 200-series districts listed                                               | https://dashboards.toastmasters.org/                                                                                                                                            |
| **TI District Summary Report** (new, replaces the Raffety Report)               | A weekly email from District Central                                                                                                                                                  | Push delivery into the inbox; official; no setup beyond subscribing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Login-gated (current leaders only); a static email; contents not published. **We could not verify whether it has trends or projections**                                                                                                                                                                           | Live since 2026-09-15                                                                             | Leader Letters, Sep and Oct 2026 (URLs in §1)                                                                                                                                   |
| **TI District Recognition dashboard**                                           | DRP progress view linked from the Distinguished Performance Reports page                                                                                                              | Official DRP status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | We could not see beyond TI's description. No sign of trends or projections                                                                                                                                                                                                                                         | Live, per the Oct 2026 Leader Letter                                                              | Leader Letter, Oct 2026                                                                                                                                                         |
| **TmTools** (marshalls.org)                                                     | A long-running suite of report generators                                                                                                                                             | Deep history: DCP history per club, charter anniversaries, realignment report, "Almost Distinguished", educational awards by member, club-website checker. Refreshed daily                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Utilitarian UI with no interactive charts, no maps, no AI. Leans on member-level education data                                                                                                                                                                                                                    | Live. Club counts dated 2026-10-30, although the page says it was last modified 2026-04-02        | https://www.marshalls.org/tmtools/                                                                                                                                              |
| **Raffety Reports** (independent)                                               | District action reports such as "Almost Distinguished" and Area To-Do                                                                                                                 | Was the de facto district action report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Replaced by TI's official report.** The independent version's current status is unverified                                                                                                                                                                                                                       | Superseded (TI)                                                                                   | Leader Letters above                                                                                                                                                            |
| **Reports2 / Reports3**                                                         | Legacy district analysis reports                                                                                                                                                      | DCP and education history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                  | **Retired.** The domain 301-redirects to toastmasters.org                                         | `reports2.toastmasters.org` (HTTP check)                                                                                                                                        |
| **LEO board / leotools** (Pacho Grande)                                         | A client-side colour grid per district                                                                                                                                                | One-screen health scan; still linked from district resource pages (e.g. D70 area-director site)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A single view with no drill-down. Last code change 2025-11-21                                                                                                                                                                                                                                                      | Live (HTTP 200), dormant                                                                          | https://code.pachogrande.com/leotools/leoboard.html , https://github.com/pachocanadian/leotools , https://sites.google.com/d70toastmasters.org.au/areadirectors/area-statistics |
| **tm-dcp "Club Health Board"** (NEW)                                            | A static GitHub Pages site built from the TI club-performance CSV export, with club locations from TI's Find-a-Club search                                                            | Every district, including dissolved ones; five finished years plus the open year; climbed/slipped lists; clustered pin map coloured by DCP; **downloadable in-year area-director .xlsx**; filter for missing CSP; refreshes weekly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DCP-only lens: no membership trends, projections, region/world views, awards, AI/MCP or dark mode. Updates weekly, not daily. Hides retrospective sections for the 201–231 districts                                                                                                                               | Active (last push 2026-10-28)                                                                     | https://github.com/adrianwongstudio/tm-dcp , https://adrianwongstudio.github.io/tm-dcp/                                                                                         |
| **Devin Pearson "Toastmasters Dashboard"** (added on review)                    | An independent Next.js site with search at district, division, area, club and region level plus a global view. Its sitemap lists about 14,500 club pages, 92 districts and 14 regions | **Closest like-for-like competitor.** District page: KPI tiles; **Distinguished District gap math** (payments, net club growth and Distinguished clubs still needed for each level); year-indexed paid-club and payment curves across 4 PYs; division table; area breakdown with visits; education levels, awards by pathway and top-10 award clubs; prospective clubs; club map; **monthly District Timeline tasks with owners**; Almost Distinguished; a "clubs that need coaches" list; district status requirements; payments split by renewal type. Club page: dated **change log with plain-language reasons** (e.g. members dropped for unpaid dues). Tools: **hypothetical area and division planners**. Also: favourites, share snapshot, print/PDF, 25-language translate menu, dark mode. Data current to 2026-11-01 | Current-year snapshot focus: no health classification, projections, survival/funnel analytics, officer-training views, council tooling or AI/MCP that we could see. **Shows named coaches with their credentials** on public pages, which crosses our member-level privacy line (§7). Analytics cookies by default | Live; data dated 2026-11-01                                                                       | https://reports.devinpearson.me/search (reviewed in browser 2026-11-01)                                                                                                         |
| **District-built dashboards**, e.g. the D31 Performance Dashboard (NEW example) | Single-district static HTML dashboards                                                                                                                                                | Tailored workflows: Distinguished tracker, near-miss "likelihood", **April renewal alert**, DRP tracker, saved-snapshot trends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | One district only; manual CSV uploads for some data; maintenance burden                                                                                                                                                                                                                                            | Active (last push 2026-08-12)                                                                     | https://glennkf.github.io/District31/D31_Performance_Dashboard.html                                                                                                             |
| **D100 / D108 / Houston dashboards** (baseline)                                 | Embedded Power BI or static pages                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                  | **Could not re-verify.** Searches found no current public page for any of the three               | —                                                                                                                                                                               |
| **Power BI / Looker Studio / Tableau Public** district reports                  | —                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                  | **No public instances found** in Nov 2026 searches                                                | —                                                                                                                                                                               |
| **easy-Speak, FreeToastHost**                                                   | Club-management suites                                                                                                                                                                | Member, role and speech history inside the club                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Club-scoped and member-level. No district analytics. FreeToastHost users iframe the TI club DCP page instead                                                                                                                                                                                                       | Live. No new district reporting found                                                             | https://apps.apple.com/us/app/easyspeak-mobile/id6756509846 , https://support.toastmastersclubs.org/kunena-2025-02-09/support-requests/26860-club-dcp-link                      |
| **Toastmasters VPE Assistant** (NEW, adjacent)                                  | A browser extension that merges Base Camp and easy-Speak Pathways progress for a club's VPE                                                                                           | Fills a real gap at club level; on the Chrome Web Store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Member-level and club-only. Not a competitor in district analytics                                                                                                                                                                                                                                                 | Active                                                                                            | https://github.com/alc-1/toastmasters-vpe-assistant                                                                                                                             |
| **AI tools for district leaders**                                               | —                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                  | **None found.** Results were only consultancy "AI opportunity" pages and member-side speech tools | —                                                                                                                                                                               |

---

## 3. Where Toast Stats now leads

Shipped since 2026-06-21. PR numbers are from `git log origin/main`.

- **Every June gap is closed.** Grid #1237, club history #1235, action list #1239,
  and the "what's missing" breakdown #1234.
- **Maps no competitor matches.** The district club map (#1925) has health, tier,
  status, members, growth, DCP, club-age, renewals, CSP, officer, coach, awards,
  attendance and meeting-day pin modes (#1972, #2049, #2118). The realignment
  sandbox is #1951. A world z0–14 self-hosted basemap is #2089. Region and world
  club explorers are #2137 and #2200, and meeting-time heatmaps are #2114 and #2207.
  tm-dcp's map shows DCP pins only. The Devin Pearson dashboard has a club locations
  map and hypothetical area/division planners, so our lead here is the depth of pin
  modes, not having a map or a planner at all. Their planners work from pasted club
  numbers; our sandbox moves clubs between areas on the map with live balance
  metrics, a shareable `?plan=` link and CSV export. The two are at parity in
  purpose, with different shapes (§4.6).
- **Parity, not gaps, on three features the first draft listed as gaps.** Payments
  split into new, April, October, late and charter (#360 → #469, the Payment
  Composition card on the district Overview). Education awards by Pathways level and
  path, and per-base award leaderboards (#1793 → #2053, #1592 → #1593, on
  `/district/:id/education`). Print of a district page via the print stylesheet
  (#427 → #477) and the council print packs (#2385).
- **Realignment-aware history.** Club-district and district-region history follow
  each club per program year (#2008, #2002, #2135). The club page resolves which
  district held the club in each year (#2067, #2068). There is a moved-region banner
  (#2197), and suppression and "moved in/out" wording across the 1 July 2026
  boundary (`programYearRuleChanges.ts`). This matters more after the realignment
  than it did before.
- **Region and world scale.** The worldwide scoreboard (#1513) is joined by region
  and world rollups for health, status, compliance (#2123), growth funnels (#2140),
  survival curves (#2138), education (#2139, #2199) and a country choropleth
  (#1935).
- **Officer-leader workflows.** Officer training views at district, region and
  compare levels (#2312, #2313, #2334). Council tooling: voting clubs in good
  standing as of a council date, for the Credentials Chair (#2382), and area and
  division council print packs (#2385). District Success Plan targets against
  actuals via `?targets=` (#2386). A next-deadline strip driven by one cited rules
  table (#2351).
- **Growth pipeline.** The Club Growth funnel (#1948) gained sponsor/mentor counts
  (#2065), suspended-this-PY lists (#2055), in-site prospective club pages (#2384)
  and a prospect checklist (#2392, #2393).
- **Recognition correctness.** Two labelled Distinguished counts, "qualifying
  today" and "confirmed" (#2390 → #2395). Confirmed Distinguished requires a
  submitted CSP (#2326). The Club Growth Achievement is tracked (#1679, #1680), with
  calculators validated against the CEO Report years (#1432).
- **Distribution and trust.** Per-district OG share cards (#2389). Fifteen how-to
  videos on `/videos` (#2357 onward). The MCP server
  `@taverns-red/toast-stats-mcp` v0.1.10 with a `/mcp` page (#1162) is still the
  **only AI-native access to Toastmasters district data that we could find**. A
  phone-first redesign (#1831–#1912).
- **Privacy as a feature.** Methodology states that member-level data is out of
  scope (#2345). Meeting links are never shown (#1882), credentials are scrubbed
  from place text (#2158, #2180), and club email and phone are stripped (#2030).

---

## 4. Where competitors still lead (honest gaps)

1. **Push delivery.** TI's District Summary Report arrives in the leader's inbox
   every week. Toast Stats is pull-only. The #2298 digest was not built, and #257
   was closed as speculative. TI has now validated the format.
2. **An offline workbook for area directors.** tm-dcp offers a per-district in-year
   **.xlsx** built for area directors. Toast Stats has CSV export on tables, the
   action list and What Changed, but no single "area pack" spreadsheet. The print
   packs (#2385) partly cover this on paper.
3. **Five-year DCP context in one district-level view.** tm-dcp puts climbed/slipped
   lists and five-year division standings on one page per district. Toast Stats
   has deep history per club and per district trends, but we did not find a
   district-level "climbed vs slipped since last year" list. **Verify before
   building.**
4. **History that predates the data window.** TmTools reaches back many years for
   DCP and charter history. Toast Stats reaches back to 2008-09 for some views and
   has an education backfill (#1802). Coverage outside those is narrower. This is a
   gap only if users ask for it.
5. **Long-tail single-purpose reports.** TmTools offers a club-website status
   checker, Triple Crown and max-awards-per-club reports. These are niche, and some
   are member-level (see §7).
6. **Devin Pearson dashboard features, verified against Toast Stats.** Checked on
   2026-11-01 against `origin/main` (`frontend/src`, `packages/`,
   `docs/product-spec.md`) and the live bundles on https://ts.taverns.red. Their
   side comes from public pages only (the browser review in §2 plus plain fetches of
   `/tools` and a district page). Only one of the nine is a true **lack**.

   | Feature                                                                                          | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                               | What is missing                                                                                                                                                  |
   | ------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Distinguished _District_ gap math at each level (payments, net club growth, Distinguished clubs) | **partial**                            | `DistinguishedDistrictTrophyCase.tsx` ("Gap to {next tier}": paid clubs, payments and Distinguished clubs as counts, with the % gap underneath) on `/district/:id` (#686, #840, #1396 → #1397); region rows count down to the minimum tier (`utils/distinguishedCountdown.ts`, #688)                                                   | We show the **next** tier only. They show every level at once. `deriveRemainingToTier(tier, ranking)` already takes any tier                                     |
   | Monthly district timeline of tasks with owners                                                   | **partial**                            | `NextDeadlineStrip.tsx` + `utils/programYearDeadlines.ts` (#2298 → #2351): 8 cited TI dates (training rounds, CSP, Oct/Apr dues, club-visit rounds) on the district, division and area pages                                                                                                                                           | Only the next two dates show; there is no whole-year view and no owner role. Any owner mapping must cite TI's role duties                                        |
   | Per-club, plain-language dated change log                                                        | **partial**                            | `/district/:id/changes` (`DistrictChangesPage.tsx`, #793) groups district-wide events between two dates (membership, payments, CSP, DCP goals, Distinguished, club status, joined/left/transferred; `snapshot-diff.schema.ts`); the club page has the Lifecycle timeline (#1843, #2169 → #2170) and multi-year history (#1229 → #1235) | No dated feed for **one** club with a reason in words (for example "membership fell at the October renewal")                                                     |
   | Payments split by renewal type (Oct, Apr, new, charter, late)                                    | **have**                               | Payment Composition card on the district Overview (`PaymentComposition*.tsx`, `utils/paymentComposition.ts`), all five types (#360 → #467/#468/#469; phone sparkbar #868 → #906)                                                                                                                                                       | —                                                                                                                                                                |
   | Education awards by pathway; top clubs by awards per base                                        | **have**                               | `/district/:id/education`: Pathways level × path matrix (`education/EducationBreakdown.tsx`, #1793 → #2053) and the "Education awards per base member" and "Members with an education award" leaderboards (`EducationAwardsLeaderboard.tsx`, #1592 → #1593); region and world views (#2139, #2199)                                     | —                                                                                                                                                                |
   | Print/PDF of a district page                                                                     | **have**                               | `styles/print.css` (#427 → #477) prints `/`, `/district/:id` and the club page cleanly, light-forced, with the URL in the margin; area and division council print packs with a Print button (#2299 → #2385)                                                                                                                            | No on-page Print button on the district page itself (Cmd-P works). Not worth ranking                                                                             |
   | Translation or i18n                                                                              | **lack**                               | No i18n library in `frontend/package.json`; `index.html` is `lang="en"`; no translate menu                                                                                                                                                                                                                                             | Browsers already offer page translation. Theirs is a third-party widget                                                                                          |
   | Hypothetical area and division planners                                                          | **have** (different shape)             | Realignment sandbox on `/district/:id/map?sandbox=1` (`components/map/realign/`, #1819 → #1951): move clubs between areas and divisions, add an area, live per-area/division balance (membership, health mix, Distinguished, 4–6 clubs norm), `?plan=` share link, CSV                                                                 | Theirs builds a full hypothetical dashboard from pasted club numbers and can mix clubs freely; ours stays inside one district, which is the realignment use case |
   | Favourites and share snapshot                                                                    | **have** share, **partial** favourites | Share: Share buttons (#357 → #405), per-district OG share cards (#2304 → #2389), URL-held state on every view and the sandbox's Copy link. Favourites: one starred "My District" (#417, landing card #2249 → #2250)                                                                                                                    | No list of several favourite clubs, areas or districts                                                                                                           |

7. **Official status.** TI's surfaces are authoritative and login-integrated (in
   District Central). No feature closes this gap. Methodology and citations are our
   answer to it.

---

## 5. Ranked opportunities

PM check for each: **who** benefits, **what problem** it solves, the **simplest
version**, then value and effort. Re-ranked on 2026-11-01 after the §4.6 checks.

| New rank | Opportunity                                                 | Was                                       | Value / effort       |
| -------- | ----------------------------------------------------------- | ----------------------------------------- | -------------------- |
| 1        | Distinguished District gap at every level                   | new (§4.6, partial)                       | high / low           |
| 2        | Predecessor history for the 201–231 districts               | 1                                         | high / medium        |
| 3        | Area workbook download                                      | 2                                         | medium-high / low    |
| 4        | Whole-year deadline timeline with cited owners, plus `.ics` | new (§4.6, partial); `.ics` was part of 3 | medium / low         |
| 5        | Per-club dated change feed on the club page                 | new (§4.6, partial)                       | medium-high / medium |
| 6        | Weekly area digest via RSS                                  | 3                                         | medium / low-medium  |
| 7        | "Climbed / slipped since last year" list                    | 4                                         | medium / low         |
| 8        | Remote MCP endpoint and registry listing                    | 5                                         | medium / medium      |

**Re-rank rationale**

- **Gap at every level (new, 1).** The cheapest high-value item on the list. It
  extends a panel that already exists, using a function that already takes any
  tier, and it answers the trio's goal-setting question ("what would Select take?")
  that our next-tier-only panel leaves open. It is the most visible place where the
  Devin Pearson dashboard is ahead.
- **Predecessor history (1 → 2).** Still unique to us and still high value. It drops
  one place only because item 1 reaches every district for a fraction of the
  effort.
- **Area workbook (2 → 3).** No change in merit. Nothing in the new competitor
  changes the area directors' need, and it stays low effort.
- **Deadline timeline with owners (new, 4).** Low effort: the cited table already
  exists and only the next two dates show. The `.ics` feed moves here from the old
  item 3 because it is the same table. Owner roles must cite TI's role duties.
- **Per-club change feed (new, 5).** Real value for area directors and club
  presidents before a visit, but it is medium effort (events per club across many
  dates) and its parts exist in What Changed and the Lifecycle card.
- **RSS digest (3 → 6).** It moves down because it should reuse the per-club and
  per-area events from item 5, and the `.ics` part has moved to item 4.
- **Climbed / slipped (4 → 7).** Still low effort, but #2163 (Clubs sorted by net
  change) covers part of it, and tm-dcp is weaker competition than the new entrant.
- **Remote MCP (5 → 8).** Our AI lead is unchallenged (neither new competitor has
  AI or MCP), so it is the least urgent. It also needs a security review.

**Not ranked, by decision:** translation (browsers already translate pages, and a
widget adds a third-party script and cookies for little leader value), a multi-item
favourites list (the "My District" star covers the main use), and a Print button
on the district page (Cmd-P already prints cleanly). Payments by renewal type and
awards by pathway are **have** and need nothing.

### 1. Distinguished District gap at every level

- **Who:** District Directors, Program Quality Directors and Club Growth Directors
  setting and tracking the district's recognition goal.
- **Problem:** the trophy case shows only the gap to the next tier, so a district
  aiming higher cannot see what Select, President's or Smedley would take without
  doing the arithmetic.
- **Simplest version:** under "Gap to {next tier}", a small table with one row per
  level and three columns (paid clubs, payments, Distinguished clubs still needed),
  built with `deriveRemainingToTier` for each tier and marked "met" where met. No
  new data.
- **Value high, effort low.**

### 2. "Before your district existed": predecessor history for the 201–231 districts

- **Who:** leaders of the roughly 30 new districts (count unverified, see §1) and
  their area and division directors.
- **Problem:** a new district has no archive anywhere. TI starts at 2026-27, and
  tm-dcp explicitly hides the retrospective sections for these districts. Leaders
  can't see whether their clubs were historically strong.
- **Simplest version:** on a 200-series district's Overview, add one panel. It takes
  the current club roster and joins it to the existing club-district history
  (#2008), then shows the prior-year DCP and membership aggregates of _those clubs_,
  labelled by predecessor district. No new pipeline is needed if the history
  artifacts already carry the per-club DCP and membership.
- **Value high, effort medium.** We are the only tool positioned to do this,
  because we already have the realignment-aware history.

### 3. Area workbook download (.xlsx or multi-sheet CSV) from the action list

- **Who:** area directors preparing club visits and council calls, often offline or
  in spreadsheets.
- **Problem:** they rebuild the same table by hand every month. tm-dcp's workbook
  shows the demand.
- **Simplest version:** one "Download area workbook" button on the action list and
  area page. Each club gets a row with goals met, what's missing, membership, CSP
  status and next deadline, built from data already on the page. Start with CSV,
  and add .xlsx only if users ask (it means a new dependency, which needs
  architecture review).
- **Value medium-high, effort low.**

### 4. Whole-year deadline timeline with cited owners, plus an `.ics` feed

- **Who:** the district trio and division and area directors planning the year.
- **Problem:** the deadline strip shows only the next two dates, so nobody can see
  the year's shape or who is responsible for each date.
- **Simplest version:** a "See all deadlines" disclosure under the strip, grouped
  by month, from the same cited table in `programYearDeadlines.ts`. Add an owner
  role only where a TI source names it, with the citation. A static `.ics` of the
  same table lets leaders add the dates to their calendars.
- **Value medium, effort low.**

### 5. Per-club dated change feed on the club page

- **Who:** area directors before a club visit, and club presidents.
- **Problem:** What Changed answers "what changed in the district between two
  dates", but not "what happened to this club, and when". Leaders piece it
  together from the history table.
- **Simplest version:** a "Recent changes" list on the club page, one dated line per
  event (membership change, payments, DCP goal gained, status change, CSP
  submitted), with a plain-language reason where the date makes it clear (for
  example the October and April renewals). Build it from the club's existing time
  series and the What Changed event categories. Aggregates only, no member names.
- **Value medium-high, effort medium.**

### 6. Weekly area digest via RSS (not email)

- **Who:** area and division directors who don't open the site weekly, including
  people who can't get TI's leader-only email (incoming leaders and Region Advisor
  staff).
- **Problem:** pull-only analytics loses to TI's push email.
- **Simplest version:** a static per-area RSS/Atom feed generated by the pipeline
  from the What Changed events (and item 5's per-club events) and the next
  deadline. No accounts, no email, no PII. Defer email until feeds show demand,
  which respects the reasoning behind closing #257.
- **Value medium, effort low-medium.**

### 7. "Climbed / slipped since last year" district list

- **Who:** district directors and PQDs setting priorities in the fall.
- **Problem:** they need to know which clubs regressed against their own last year
  and which improved. tm-dcp leads on this.
- **Simplest version:** a preset on the Clubs table that compares DCP goals now with
  the same date last PY, drawing on history already on the club pages. Verify
  first that this isn't already covered by "sorted by net change" (#2163).
- **Value medium, effort low.**

### 8. Remote (hosted) MCP endpoint and listing in MCP registries

- **Who:** leaders who use Claude or ChatGPT-style assistants but won't install an
  npm stdio server.
- **Problem:** our unique AI access sits behind an install step.
- **Simplest version:** a read-only remote MCP endpoint over the same CDN, with the
  same tools and no auth (the data is public). Then submit it to the public MCP
  registries. We did **not** check current registry listings.
- **Value medium, effort medium.** It needs security review (`ron-sec`), because it
  creates a new public surface.

---

## 6. Risks and threats

- **TI builds analytics into District Central.** The District Summary Report shows
  TI is now investing in leader reporting. If it adds trends or projections, our
  differentiation narrows to maps, regions, history and AI. _Mitigation:_ lead on
  what TI is slow to do (cross-district views, realignment-aware history, MCP), and
  keep methodology citations so leaders trust us as a companion, not a rival.
- **Data access on `dashboards.toastmasters.org`.** Everything depends on public
  export and HTML endpoints with no API or published terms of use. The rollover
  302 behaviour (#1284) shows the endpoints change without notice. Reports2's
  retirement shows TI does shut legacy surfaces. Failure modes include
  authentication being added, rate limits, a CSV schema change, or a Find-a-Club
  API change, which would affect our maps and tm-dcp's alike. _Mitigation:_ we
  already have content gates and holds (#1716, #1777) and a schema canary (#1712).
  Next steps: keep an inventory of every TI endpoint we read, with a fallback for
  each.
- **Realignment churn.** Merged and renumbered districts break year-over-year
  comparisons, deep links and SEO for dissolved numbers. Region realignment adds a
  second layer. We already have suppression and redirect logic, but any district
  number that gets reused would be a new hazard.
- **A direct competitor already exists.** The Devin Pearson dashboard is current, broad and polished. Overlap is high on district and club views. Our differentiation is analytics depth (health, projections, funnels, survival), realignment-aware history, officer and council workflows, the MCP server, and a privacy stance that never names individual members.
- **Low-cost clones.** tm-dcp shows that one person can build all-district coverage
  from a single CSV per district per year in under a minute of fetches. Breadth is
  no longer a moat. Depth, correctness, UX and AI are.
- **The Tally rename (ops#37).** Phase 2 (re-skin plus rename) is still blocked.
  The rename risks losing inbound links, bookmarks, OG cards and the 15 published
  videos (which carry the current name), plus `/mcp` docs and the npm package name.
  _Mitigation:_ 301 the domain, keep the npm scope (`@taverns-red/*` is already
  independent of the product name), budget a re-render of the videos, and announce
  through the same district channels.
- **Trademark and separation.** Using TI names such as "District Summary Report"
  in our UI or marketing raises trademark exposure. Keep "Toast Stats" or "Tally"
  clearly unofficial (as the leotools README does), and keep the ADR 0002
  separation for D61/NFP work.

---

## 7. Deliberately not chasing

Consistent with the de-identification stance in Methodology (#2345):

- **Per-member education tracking, member award leaderboards, Triple Crown or
  max-awards-per-member reports** (TmTools territory), and **Pathways progress
  merging** (VPE Assistant territory). These are member-level and club-internal,
  and add no district-leader value that justifies the PII.
- **Member names, emails, phone numbers and meeting links** in any surface,
  including the proposed workbook, feeds and MCP. Aggregates and club-level only.
- **Emailed digests that need us to store leaders' contact details.** Use RSS or
  ICS first (opportunities 4 and 6). Email only if demand is proven, and only through a
  design that holds no mailing list of members.
- **Club-management features** (agendas, timers, role booking, speech evaluation):
  a crowded, club-scoped market (easy-Speak, FreeToastHost and many GitHub tools)
  outside our district-analytics lane.
- **Login-gated TI data** (District Central, Base Camp internal APIs). It is not
  public, so it would break our CDN-only, no-auth architecture and the terms we
  operate under.
- **Club-website status checking.** It is niche, and it means crawling club sites
  that aren't TI data.
