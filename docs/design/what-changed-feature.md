# "What Changed" — snapshot-to-snapshot diff

**Epic:** #797 · **Authored:** 2026-05-27 (Sprint 1, #793)

Surface _what changed between two recorded snapshot dates_ for a district —
default "since the previous recorded date," and (Phase 2) any arbitrary date
pair in history. The app today shows current state and continuous trends but
never a date-to-date diff.

## §1. Phasing

| Phase | Issue | Scope                                                                                                                                                                         |
| ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | #793  | Pure `diffSnapshots` engine + `SnapshotDiff` type + **default** district digest page at `/district/:id/changes` (from = previous recorded date, to = latest). No date picker. |
| 2     | #794  | Arbitrary date-pair picker (from/to, URL-synced, per-district index).                                                                                                         |
| 3     | #795  | Per-club delta table + diff CSV export.                                                                                                                                       |
| 4     | #796  | (optional) Pre-computed GCS digest + cross-district view.                                                                                                                     |

## §2. Architectural spine

- **Pure diff engine** `diffSnapshots(from, to): SnapshotDiff` in
  `analytics-core` — no I/O, fully unit-testable, and reusable by a future
  collector pre-compute step (Phase 4) without a rewrite.
- **Client-side first** — fetch two dated snapshots and diff in a hook
  (`useSnapshotDiff`). Defer GCS pre-compute to Phase 4 (R7 — don't build
  backend before need).
- `from`/`to` are owned by the **page** and passed as props (R3); the hook
  never re-derives them from response data.

## §3. The load-bearing data finding (Lesson 115 — verified 2026-05-27)

The diff MUST be computed from two actual dated
`snapshots/{date}/district_{id}.json` files (`PerDistrictData.data`,
type `DistrictStatisticsFile`). Two traps were verified against the live
staging CDN for District 61 (2026-05-25 → 2026-05-26):

1. **`district_{id}_analytics.json` delta fields are single-snapshot** — they
   read `0` on the frontend. Building on them ships a feature that always says
   "nothing changed." (Epic constraint, Lesson 115.)
2. **`totals.distinguishedClubs` / `selectDistinguishedClubs` /
   `presidentDistinguishedClubs` are unpopulated mid-year** — all three read
   `0` even when `clubPerformance` shows 49–50 distinguished clubs. The
   authoritative per-club tier is the raw `clubPerformance`
   `Club Distinguished Status` field (`'' | D | S | P | M`). **Distinguished
   aggregates and flips are counted from that field, never from `totals.*`.**
   (Verified: D61 went 49 → 50 distinguished, one `'' → D` flip, while
   `totals.distinguishedClubs` stayed `0` on both dates.)

Real deltas verified for the D61 pair: membership 2716 → 2742 (+26), payments
5723 → 5749 (+26), clubs 161 → 162 (one club joined: "iA Montreal
Toastmasters", Active), 7 clubs changed membership/goals.

## §4. `SnapshotDiff` shape (`packages/shared-contracts`)

Per-aggregate delta is `{ from, to, delta }` (`delta = to − from`, signed).

- `districtId`, `from.date`, `to.date`, `dayCount` (calendar days between —
  surfaced in the headline so sparse gaps are honest).
- `totals`: `membership`, `payments`, `clubCount`, `distinguished` (the four
  KPI cards).
- `clubs`: `bothPresent: ClubDiff[]`, `onlyInFrom: ClubPresence[]` (left the
  roster), `onlyInTo: ClubPresence[]` (joined the roster) — joined by `clubId`.
  `ClubPresence` carries `clubStatus` so roster appear/disappear is
  **classified** (Lesson 118), never shown as an error.
- `events: DiffEvent[]` — categorized, narrative-ready, sorted by magnitude.
  Categories: `membership`, `dcp-goals`, `distinguished`, `club-added`,
  `club-removed`. (Payments is an aggregate KPI only; per-club payment churn
  would double the membership noise in v1.)
- `rosterDiscontinuity?` (#1443) — set when the two dates straddle a
  **district-composition change**: a realignment (2026-07-01 merged and split
  districts) moves clubs between districts at the program-year boundary, and
  the default "previous → latest" pair straddles it. When set, the roster
  moves it caused are emitted as `club-transferred-in` / `club-transferred-out`
  and marked `transferred` on the presence lists, so they read as a map change
  rather than as clubs joining and leaving. Genuine charters (chartered inside
  the window) and closures (suspended/ineligible on the way out) keep the
  roster categories so they stay visible. Detection needs all of: different
  program years, ≤120 days apart, and ≥8 clubs moved AND ≥20% of the smaller
  roster — deliberately conservative, since a false positive mislabels honest
  club behaviour. The **default date pair is unchanged**: whether the view
  should skip across such a boundary is a product call.

`ClubDiff` carries `membership`/`payments`/`dcpGoals` deltas plus
`distinguishedFrom`/`distinguishedTo`/`distinguishedChanged`. DCP signals come
from raw `clubPerformance` goal fields, never inferred Goals 1–N order
(tripwire).

- **`payments` events (#1459)** — the per-club payments delta, with the payment
  TYPE attribution carried in the label text (no structured `breakdown` field
  until a consumer needs to compute over one). October/April renewals and new
  members come from the typed `clubs[]` fields; late renewals and charter
  payments come from the raw `districtPerformance` rows (`Late Ren.` /
  `Total Chart`), which are untyped and therefore **optional** — absent or
  unreadable leaves the type `undefined`, never 0, and its share surfaces as an
  `N other` residual. The named parts always sum to exactly the total; when the
  per-type counts overshoot it (their source columns can skew independently of
  the total) the breakdown is dropped rather than contradicting the headline. A
  DECREASE gets no breakdown at all — a falling payments total is a TI-side
  correction, not clubs un-paying a renewal.

- **`csp` events (#1460)** — a club's Club Success Plan submission flip, shown
  in a **Club Success Plan submissions** group in the recognition band (a CSP
  is a Distinguished prerequisite, so it reads beside the club tier changes).
  Magnitude is a direction, not a delta: `+1` for a submission, `-1` for the
  rare un-submission, which is reported rather than hidden so the feed cannot
  silently disagree with the club page. `clubs[].cspSubmitted` is **optional**
  — a real boolean from PY 2025-26 onward, and **absent (never `false`)**
  before it — so an event is emitted only when both sides are real booleans
  that differ. An absent side is silence, always. In particular this path
  deliberately does **not** use `getCSPStatus`: its `?? true` default is right
  for distinguished eligibility (a club must not be penalised for a column that
  did not exist) and wrong here, where it would turn any diff spanning the
  PY 2025-26 boundary into a district-wide phantom flip. Per-club submission
  **dates** (the `clubSuccessPlan` section of `district_{id}_reports.json`) are
  out of scope — they need a second fetch in `useSnapshotDiff`, and the flip
  already answers "who submitted since last time".

## §5. Phase 1 frontend

- `useSnapshotDiff(districtId, from, to)` — React Query keyed by the date pair,
  fetches both dated snapshots, returns `diffSnapshots(...)`.
- `previousRecordedDate(index, districtId)` — the per-district snapshot index
  `[-2]` (never the global dates list). `[-1]` is `to`.
- `DistrictChangesPage` (lazy route `/district/:districtId/changes`) — narrative
  headline + 4 `KpiDeltaCard`s + grouped collapsible change list.
- `DistrictSubnav` gains a "What Changed" section (a real route, per ADR-005).
- **Empty/edge states:** only one snapshot for the district → digest disabled
  with an explanation; no changes in range → "No recorded changes" (a valid
  outcome, not an error).

## §6. Verification

Drive the real page on the PR preview channel (staging CDN) for ≥1
representative district (D61) — assert non-zero rendered deltas (Lesson 115:
verify the served value, not just a prop-fed unit test). Unit tests cover the
pure engine (aggregates, all three partitions, every event category) with a
failing test first.
