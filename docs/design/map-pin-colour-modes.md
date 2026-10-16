# Map pin colour modes — one system for district, region and world maps (#1785)

**Date:** 2026-10-12
**Epic:** #1781. **Consumers:** #1784 (district map, core modes), #1787 (extended modes), #1788 (filters + side panel), #1808 / #1809 (region / world explorers), #1800 (per-region shards — this doc sets their field list), #1786 (basemap — this doc sets its land/water colours).
**Source:** `.routine-tmp/feature-design-2026-10-11.md` §2.1 and **§7 Decisions (2026-10-11)**, items 2, 11 and 12.
**Status:** Approved 2026-10-12. The decisions are recorded in [§11](#11-decisions-2026-10-12).

Every data claim below was checked against the shared-contracts Zod schemas on `origin/main` @ `d1aa0b81`. Each was also checked against one CDN object read with a single `curl --compressed` (D61, snapshot date **2026-10-11**):

- `snapshots/2026-10-11/district_61.json`
- `snapshots/2026-10-11/analytics/district_61_analytics.json`
- `snapshots/2026-10-11/district_61_reports.json`
- `snapshots/2026-10-11/all-districts-rankings.json`

All counts quoted as "D61" come from those files.

---

## 1. Principles

1. **One registry, every map.** A mode is defined once: its id, source field, bins, palette, shape and legend copy. The district, region and world maps all read that one registry. Like `clubGridColor.ts` (#1230), the legend is derived from the same maps the pins use, so legend and pins cannot drift (Lesson 052).
2. **Never colour alone (WCAG 1.4.1).** Every category also differs by **shape**, by **fill level**, or by an **on-map label**. The legend shows the shape next to the colour and the text.
3. **Absent is not zero.** Each mode has a separate **"Not available for this date"** state, drawn with its own glyph. A missing report never becomes "No", "0" or "Not submitted".
4. **Theme-stable fills, theme-aware outlines.** Pin fills are the same hex in light and dark, the same pattern as the shipped status pills (Lessons 062/116). Only the outline, halo and label colours flip. That gives one palette to validate rather than two.
5. **Status consumers read the overlay.** Health, operational status and every status-derived mode resolve the read-time `statusOverlay` (#1069) before the frozen `clubStatus` (Lesson 172), as `getTileVisual` does.

## 2. The default mode: club health

**Decision (Ron, 2026-10-11, §7.11):** the default is **club health status** (thriving / vulnerable / intervention-required). It is "the mode most impactful to a district leader all year long". The feature design chose it, and #1784, #1808 and #1809 carry it as an acceptance criterion. This doc confirms it, for four reasons:

| Test                                     | Health                                                                                                                                                         | Distinguished level (runner-up)                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Is it defined on every day of the PY?    | Yes. `classifyClubHealth` (`analytics-core`, #1120) uses membership, net growth, the **month-scaled** DCP checkpoint and CSP, so it is meaningful from July 1. | Mostly no. It is year-cumulative and starts at zero every July (Lesson 57).     |
| D61 on 2026-10-11                        | **29 thriving · 47 vulnerable · 85 intervention**: all 161 classified, with a spread worth looking at.                                                         | **156 not yet · 5 Distinguished** (2 provisional). The map would be one colour. |
| Can a leader act on it?                  | Yes. It tells them where to visit, coach or call this month.                                                                                                   | Mostly retrospective until April, when the tiers confirm.                       |
| Is it consistent with existing surfaces? | It is the default of the club grid (`?color` defaults to `health`), the Clubs table status column and the action list.                                         | It is the grid's second mode (`tier`).                                          |

Distinguished level stays **one tap away**: it is the second item in the mode picker and the second segment of the desktop quick toggle.

## 3. Shared visual vocabulary

### 3.1 Pin anatomy

- **Visual size:** 14 px at district zoom and 12 px at world zoom. A selected pin is 20 px.
- **Outline:** 1.5 px in the theme outline colour (§6), so every pin clears 3:1 against land and water (WCAG 1.4.11) whatever its fill.
- **Hit area:** 44 × 44 px, using a 22 px `queryRenderedFeatures` box around the tap point. The visual size never sets the hit area.
- **Selected pin:** a 20 px version of the same shape with a double ring (outline colour, then halo colour). Amber is never used for selection, because amber means "vulnerable".
- **Rendering:** MapLibre `symbol` layers with **SDF sprites**, one per shape. `icon-color` is the category fill and `icon-halo-color` is the outline. This is one clustered GeoJSON source, not DOM markers, per #1784's performance criterion.

### 3.2 Shape families (the non-colour channel)

| Family            | Used by                                                        | Glyphs                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status shapes** | health, operational status, renewals, CSP, officer list, coach | ● good / done · ▲ warning / partial · ■ needs action · ◆ ineligible                                                                                                                |
| **Fill level**    | tier, size band, DCP goals, charter age, awards per member     | ○ ◔ ◑ ◕ ●: 0 %, 25 %, 50 %, 75 % and 100 % of the pin filled, lowest bin to highest                                                                                                |
| **Direction**     | net growth                                                     | ▼ full · ▼ half · ● · ▲ half · ▲ full                                                                                                                                              |
| **Code label**    | division, area, district, region, meeting day                  | Pins become rounded badges carrying the code (`B`, `B12`, `61`, `R8`, `Tu`) at z ≥ 11. Below that zoom, territory labels carry the identity (§7)                                   |
| **Shared states** | every mode                                                     | ◌ **Not available for this date**: a 70 % size hollow ring in `--rt-ink-3` · ⊘ **Suspended**: grey ring with a slash, an override in every mode except `status` (same as the grid) |

The status shapes reuse the meaning of the existing ✓ ⚠ ✗ pill glyphs: ● matches ✓, ▲ matches ⚠ and ■ matches ✗. The legend shows the pin shape **and** the text glyph, so the map and the Clubs table read alike.

### 3.3 Palettes

All palettes passed the validator described in §6, and every hex is theme-stable. The images are in the PR.

| Palette        | Kind        | Fills (low → high, or by category)                                                                                                                          |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health`       | status      | Thriving `#2A8F6E` (`--rt-good`) · Vulnerable `#E0A030` · Intervention `#C93D3D` (`--rt-bad`)                                                               |
| `compliance`   | status      | Done `#2A8F6E` · Partly / pending `#E0A030` · Needs action `#C93D3D` · Ineligible `#8C8A82`                                                                 |
| `status`       | status      | Active `#2B6FB0` · Low `#E0A030` · Ineligible `#C93D3D` · Suspended `#8C8A82`                                                                               |
| `tier`         | ordinal     | Not yet `#D6D3CC` · Distinguished `#7FB8D9` · Select `#2C6E90` (`--loyal-400`) · President's `#004165` (`--loyal-500`) · Smedley `#7B1828` (`--maroon-500`) |
| `sequential5`  | ordinal     | `#DCE9F5` `#9ECAE1` `#5A9FCF` `#2B6FB0` `#0B3F7A`                                                                                                           |
| `diverging5`   | diverging   | `#B2182B` `#EF8A62` `#D9D6D0` `#67A9CF` `#2166AC` (red = decline, blue = growth; it survives red-green CVD)                                                 |
| `categorical8` | categorical | `#332288` `#44AA99` `#DDCC77` `#CC6677` `#88CCEE` `#117733` `#882255` `#999933` (Paul Tol "muted")                                                          |
| `coach`        | status      | Coach active `#882255` · Coaching complete `#88CCEE` · No coach `#D6D3CC`                                                                                   |
| `attendance`   | categorical | In person only `#332288` · Online attendance possible `#44AA99` · Online only `#DDCC77` · Not stated `#D6D3CC` (small dot, #1787)                           |
| `day`          | categorical | Mo–Su `categorical8[0..6]` in weekday order · Several days `#999933` · Not stated `#D6D3CC` (small dot, #1787)                                              |

There are two deliberate departures from the shipped pills:

- **Health** pins use saturated fills, not the pills' soft tints (`#dcfce7` …). A tint disappears against `--rt-paper` land at 14 px.
- **Distinguished** pins replace the pill's `--green-600` with a light blue `#7FB8D9`. That keeps the four tiers one ordinal blue ramp with monotone lightness, which the validator requires, and keeps green meaning "healthy". The tier pills in the table are unchanged. The map legend shows the tier name, so nothing is ambiguous.

## 4. The modes

`id` is the `?color=` value (§9). Levels: **D** = district map (#1784/#1787), **R** = region explorer (#1808), **W** = world explorer (#1809). "Shard" means the field must be present in the #1800 per-region shard for that level to offer the mode.

### 4.1 Core modes (#1784, plus district and region in #1808/#1809)

| id                   | Mode                | Source (exact field · file)                                                                                                                                                                                                                                                     | Scale · bins                                           | Palette · shape                                       | Levels                   |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | ------------------------ |
| `health` _(default)_ | Club health         | `allClubs[].currentStatus` · `analytics/district_<id>_analytics.json`. Typed `ClubTrend` in `useDistrictAnalytics.ts`. Values from `ClubHealthStatusSchema` (`shared-contracts/schemas/club-health-status.schema.ts`), computed by `ClubHealthAnalyticsModule.assessClubHealth` | categorical (3)                                        | `health` · status shapes                              | D R W (shard: `h`)       |
| `tier`               | Distinguished level | `allClubs[].distinguishedLevel` + `isProvisionallyDistinguished` · same file. The snapshot's `clubs[].distinguishedStatus` (`ClubStatisticsFileSchema`) is **absent on all 161 D61 clubs** on 2026-10-11, so do not read it                                                     | ordinal (5)                                            | `tier` · fill level. Provisional = **dashed** outline | D R W (shard: `t`, `tp`) |
| `division`           | Division            | `clubs[].divisionId` / `divisionName` · `snapshots/<d>/district_<id>.json` (`ClubStatisticsFileSchema`)                                                                                                                                                                         | categorical, high-cardinality (D61: 8)                 | `categorical8` by adjacency (§7) · code label         | D                        |
| `area`               | Area                | `clubs[].areaId` / `areaName` · same file                                                                                                                                                                                                                                       | categorical, high-cardinality (D61: 34)                | `categorical8` by adjacency · code label (`B12`)      | D                        |
| `district`           | District            | the shard's `d`, which is `districtId` of the source snapshot                                                                                                                                                                                                                   | categorical, high-cardinality (region: 5–8; world: 94) | `categorical8` by adjacency · code label (`61`)       | R W                      |
| `region`             | Region              | `rankings[].region` (`AllDistrictsRankingsSchema`, `region: z.string()`) · `snapshots/<d>/all-districts-rankings.json`, resolved **per PY** through #1820. Today there are 14 regions plus `DNAR` (1 district)                                                                  | categorical (15)                                       | `categorical8` by adjacency · code label (`R8`)       | W                        |

### 4.2 Extended modes (#1787)

| id           | Mode                        | Source (exact field · file)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Scale · bins (D61 counts, 2026-10-11)                                                                                                                                                                                                                   | Palette · shape                                                                             | Levels              |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `status`     | Operational status          | `clubs[].clubStatus` (`ClubStatisticsFileSchema`) with the `statusOverlay` from `octoberDuesRenewal`/`aprilDuesRenewal` applied first                                                                                                                                                                                                                                                                                                                                                                       | Active 137 · Low 17 · Ineligible 7 · Suspended 0                                                                                                                                                                                                        | `status` · status shapes (⊘ for Suspended)                                                  | D R W               |
| `size`       | Membership size             | `clubs[].membershipCount` (CSV `Active Members`)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | sequential: **0–7** (24, below the 8-member minimum) · **8–11** (62) · **12–19** (41, 12 is the health threshold) · **20–29** (26, 20 is the DCP / 20-Plus line) · **30+** (8)                                                                          | `sequential5` · fill level                                                                  | D R W               |
| `growth`     | Net growth since July       | `membershipCount − membershipBase` (equal to CSV `Net Growth`)                                                                                                                                                                                                                                                                                                                                                                                                                                              | diverging: **≤ −5** (69) · **−4…−1** (63) · **0** (15) · **+1…+2** (9) · **≥ +3** (5, where +3 is the health override)                                                                                                                                  | `diverging5` · direction                                                                    | D R W               |
| `dcp`        | DCP goals met               | `clubs[].dcpGoals` (CSV `Goals Met`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | sequential, on tier lines: **0–2** (121) · **3–4** (30) · **5–6** (10, the Distinguished range) · **7–8** (0, Select) · **9–10** (0, President's)                                                                                                       | `sequential5` · fill level                                                                  | D R W               |
| `awards`     | Education awards per member | Σ `achievementCount` over `sections.educationAchievements.records[]` for the club (`EducationAchievementActivityRecordSchema`, the **ledger only**, Legacy and Pathways both counted: §7.6 and §7.10) ÷ `clubs[].membershipCount`                                                                                                                                                                                                                                                                           | sequential: **0** (69) · **< 0.25** (65) · **0.25–0.5** (14) · **0.5–1** (6) · **≥ 1** (3). **N/A**: 0 members (4), or no ledger for the date (before 2026-08-21)                                                                                       | `sequential5` · fill level                                                                  | D R W (shard: `ea`) |
| `renew-oct`  | October dues renewal        | `sections.octoberDuesRenewal.records[].renewalStatus` (`DuesRenewalRecordSchema`) · `district_<id>_reports.json`                                                                                                                                                                                                                                                                                                                                                                                            | `Verified complete – date` → **Renewed** (137) · `Low – Minimum requirement not yet met` → **Below minimum** (17) · `**Renewals not here**` → **Not received** (4) · `Ineligible – …` → **Ineligible** (3)                                              | `compliance` · status shapes                                                                | D R W (shard)       |
| `renew-apr`  | April dues renewal          | `sections.aprilDuesRenewal…renewalStatus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Same as October, plus **Not open yet**: a verified date before the viewed PY's July 1 belongs to the previous round. On 2026-10-11 all 158 "verified" dates are January–March 2026, so all 158 are "Not open yet" and the map must not paint them green | `compliance` · status shapes                                                                | D R W (shard)       |
| `csp`        | Club Success Plan           | `sections.clubSuccessPlan.records[].submissionDate` (date → submitted; `Not Submitted` → not). Fallback is `clubs[].cspSubmitted` (CSV `CSP` Y/N). The report wins: on 2026-10-11 club 6871192 shows "October 6, 2026" in the report but `N` in the CSV                                                                                                                                                                                                                                                     | **Submitted** (144) · **Not submitted** (17) · **N/A** before PY 2025-26                                                                                                                                                                                | `compliance` · status shapes                                                                | D R W (shard)       |
| `officers`   | Officer list submitted      | `sections.officerList.records[].officerListSubmitted` (`OfficerListRecordSchema`)                                                                                                                                                                                                                                                                                                                                                                                                                           | **Submitted** (158) · **Not here** (3). There is no CSV fallback, because `Off. List On Time` is a different fact (on time, not submitted)                                                                                                              | `compliance` · status shapes                                                                | D R W (shard)       |
| `coach`      | Club coach                  | Presence in `sections.coaches.records[]` (`CoachRecordSchema`), keyed by `club`. `activeCoach: true` → **Coach active** (6). `status: AWARDED` → **Coaching complete** (6). Absent from a present section → **No coach** (149). Section absent → **N/A**                                                                                                                                                                                                                                                    | categorical (3)                                                                                                                                                                                                                                         | `coach` · status shapes, exception first                                                    | D R W (shard)       |
| `day`        | Meeting day                 | `clubs[].meetingSchedule[].day` (#1789), read from `allClubs[]` in the analytics file. The free-text `meetingDay` is never parsed by the frontend. A club meeting on two or more weekdays is **Several days**; no parsed schedule is **Not stated**; a date with no schedules for any club is **Not available**                                                                                                                                                                                             | categorical: Mo Tu We Th Fr Sa Su · **Several days** · **Not stated** (D61 2026-10-15: 21 · 46 · 37 · 35 · 9 · 7 · 0 · 3 · 3)                                                                                                                           | `categorical8` (first 7, in weekday order) · code label `Tu`, `2+` · Not stated a small dot | D R W               |
| `attendance` | Online / hybrid             | `meetingSchedule[].mode` (#1789) first, then `allowsVirtualAttendance`. **Online only**: every parsed meeting is `online`. **Online possible**: the flag, or any `online` / `hybrid` meeting. **In person only**: the flag is false, or an `in-person` meeting. Otherwise **Not stated**. The collector derives `mode` from the club's own FAC day, time and location text, so the frontend never reads `location` (on D61 2026-10-15 all 56 locations with an online word carry an online or hybrid entry) | categorical (4) (D61 2026-10-15: 45 · 71 · 43 · 2)                                                                                                                                                                                                      | `attendance` · ● in person · ◐ online possible · ○ online only · small dot not stated       | D R W               |
| `age`        | Charter age                 | `clubs[].charterDate` (FAC), age at the **viewed snapshot date**, not today                                                                                                                                                                                                                                                                                                                                                                                                                                 | sequential: **< 1 yr** (5) · **1–2** (7) · **3–9** (22) · **10–24** (50) · **25+** (75)                                                                                                                                                                 | `sequential5`, reversed so new clubs are darkest · fill level                               | D R W               |

Ron's list includes three more items, which this design handles differently:

- **"Vulnerable / intervention".** This is **not a separate mode**. It is the health mode with its legend filtered: the "Needs attention" chip writes `?status=vulnerable,intervention` (the existing Clubs-table contract). A separate mode would show the same three colours under a second name. _(Decided 2026-10-12; see §11.)_
- **"Prospective".** This is **not a colour mode and not a map layer.** Prospective clubs are not in `clubs[]`. They come from `prospectiveClubs[]` (`ProspectiveClubSchema`), which has **no coordinates**: only `city`, `region` and `country` (D61: 8 of 8 without coordinates). They are shown as a count and a list in the side panel / sheet under "Prospective (8)", and there is no pipeline geocoding. _(Decided 2026-10-12; see §11.)_
- **"Club status / health"** is covered by two modes: `health` (the default) and `status`, the operational TI status.

### 4.3 Legend copy

Every legend has a title, the "as of" date, chips (shape + swatch + label + count), the shared states and the unmapped line. The counts include **every club in scope, mapped or not**, so they equal the Clubs table's counts.

Zero-count chips are handled by mode type:

- **Status and categorical modes** hide a chip whose count is 0, for example "Suspended 0".
- **Ordinal modes** (tier, size, DCP, age, awards) always show every step, so the ladder stays readable: "Select 0" says how far there is to go.

| Mode                                        | Legend title                             | Chips (in order)                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health`                                    | **Club health** · as of 11 Oct           | ● Thriving 29 · ▲ Vulnerable 47 · ■ Intervention required 85 · ⊘ Suspended 0 (hidden at 0) · link "How is this decided?" → `/methodology#club-health` |
| `tier`                                      | **Distinguished level** · as of 11 Oct   | ● Smedley · ◕ President's · ◑ Select · ◔ Distinguished 5 · ○ Not yet Distinguished 156 · dashed "Projected: confirmed after April" 2                  |
| `status`                                    | **TI club status**                       | ● Active · ▲ Low · ■ Ineligible · ⊘ Suspended                                                                                                         |
| `division` / `area` / `district` / `region` | **Division** (or Area, District, Region) | Top 5 by clubs in view, then "N more". Each chip is code + name + count, for example "B · Division B 28"                                              |
| `size`                                      | **Members**                              | 0–7 · 8–11 · 12–19 · 20–29 · 30+                                                                                                                      |
| `growth`                                    | **Net growth since 1 July**              | −5 or worse · −1 to −4 · No change · +1 to +2 · +3 or better                                                                                          |
| `dcp`                                       | **DCP goals met**                        | 0–2 · 3–4 · 5–6 · 7–8 · 9–10, with the tier names in the half-detent sheet                                                                            |
| `awards`                                    | **Education awards per member (PYTD)**   | 0 · under 0.25 · 0.25–0.5 · 0.5–1 · 1 or more. Footnote: "Every award counts, Pathways and legacy (TI education ledger)"                              |
| `renew-oct` / `renew-apr`                   | **October (or April) renewals**          | ● Renewed · ▲ Below minimum · ■ Not received · ◆ Ineligible · ◌ Not open yet (April only)                                                             |
| `csp`                                       | **Club Success Plan**                    | ● Submitted · ■ Not submitted                                                                                                                         |
| `officers`                                  | **Officer list**                         | ● Submitted · ■ Not received                                                                                                                          |
| `coach`                                     | **Club coach**                           | ● Coach active · ◆ Coaching complete · small dot "No coach"                                                                                           |
| `day`                                       | **Meeting day**                          | Mo … Su · Several days · Not stated, in weekday order (not by count)                                                                                  |
| `attendance`                                | **How members attend**                   | ● In person only · ◐ Online attendance possible · ○ Online only · • Not stated                                                                        |
| `age`                                       | **Club age**                             | Under 1 year · 1–2 years · 3–9 years · 10–24 years · 25 years or more                                                                                 |

**Missing data, shared by every mode:**

- **◌ "Not available for this date"** means the source does not exist for the viewed date. Examples: reports before 2026-08-21, CSP before PY 2025-26, `meetingSchedule` before #1789. The chip shows the count and a one-line reason in the half-detent sheet, for example "Club coach reports start 21 Aug 2026". If **every** club is unavailable, the legend collapses to one line, "Club coach is not available for 31 May 2026", and the pins stay drawn as ◌.
- **"Not on the map (2)"** lists clubs without coordinates, with the reason "No Find-a-Club location". It is always shown, as the first row of the full-detent sheet (#1784).
- **"No location data for this date"** is the full-map empty state for enrichment-stripped dates (prod 2026-05-31), with a jump-to-latest date chip. The legend still shows the counts.

## 5. Interaction and accessibility

- **Mode picker.** Below 768 it is a pill, "Colour: Health ▾", that opens the existing modal `BottomSheet` (#1831). At 768 and above it is a popover. Modes are grouped (Health & status · Territory · Membership & DCP · Compliance · Meeting) and each row shows name, a 5-swatch preview and the shape icon (#1784). At ≥ 1024 a two-segment quick toggle **Health | Distinguished** sits beside the pill, so the runner-up mode is one tap away at every width.
- **Legend chips** are `aria-pressed` toggle buttons, not tabs (Lesson 128). They are ≥ 44 px tall, ≥ 8 px apart, with 14 px text. A chip filters the map to its category. Clicking writes the mode's **facet param** with one URL write per handler (Lesson: two URL-state hooks lose a facet). An `aria-live="polite"` line announces "Showing 85 of 161 clubs".
- **Pins and clusters from the keyboard.** The map region (`role="region"`, `aria-label="Club map, coloured by club health"`) has one tab stop. Arrow keys move a roving focus across the visible pins and clusters in reading order (north to south, then west to east) and pan to keep the focused one in view. Enter opens the club sheet; on a cluster, Enter zooms to its expansion zoom. Each focusable has an `aria-label` such as "Limestone City Club, Division A, Area 01, Intervention required". `?view=list` (#1784, #1833) is the full non-map equivalent with the same filters.
- **Reduced motion.** Cluster expansion and `flyTo` jump instead of animating.

## 6. Contrast and colour-blind validation

### 6.1 Method

The validator is in the PR at `.pr-assets/<pr>/palette_check.py`. It is pure Python with no dependencies, and its run output is attached. #1784 must port it as a unit test (`mapPalette.test.ts`) so that a palette edit fails CI instead of drifting. It checks four things:

1. **CVD simulation:** the Machado, Oliveira & Fernandes (2009) matrices at severity 1.0 (protanopia, deuteranopia, tritanopia), applied in linear sRGB.
2. **Distinctness:** CIEDE2000 ΔE.
   - Categorical and status palettes: **every pair** must reach ≥ 15 under normal vision and ≥ 8 under each simulation.
   - Ordinal and diverging palettes: **adjacent** steps must reach ≥ 8 under every vision.
3. **Order survives CVD:** ordinal palettes need monotone CIE L\* under every simulation. Diverging palettes need L\* to peak at the neutral centre under every simulation.
4. **Contrast** (WCAG 2.x ratio):
   - The pin outline against basemap land **and** water, in both themes, must reach ≥ 3:1 (1.4.11).
   - For each fill, the better of white or `--rt-ink` text must reach ≥ 4.5:1 (1.4.3), for cluster counts and on-pin codes. The validator records which one wins, and the renderer uses it.

### 6.2 Results (all pass)

| Check                                                               | Result                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Outline vs land / water, light (`#344052` on `#FFFFFF` / `#CBDDE7`) | 10.49:1 / 7.51:1 (#2087 `--ink-2`; was 11.16 / 7.99 with `#3D3B38`)   |
| Outline vs land / water, dark (`#C8D1DD` on `#161F2A` / `#0A0F15`)  | 10.78:1 / 12.47:1 (#2087 `--ink-2`; was 14.74 / 17.06 with `#F4F1EB`) |
| `health`, min ΔE (normal / protan / deutan / tritan)                | 38.0 / 16.4 / 15.6 / 22.9                                             |
| `compliance`                                                        | 38.0 / 16.4 / 15.6 / 22.9                                             |
| `status`                                                            | 26.4 / 20.6 / 17.9 / 22.9                                             |
| `categorical8`                                                      | 16.1 / 11.8 / 14.0 / 12.3                                             |
| `tier`, adjacent                                                    | 15.4 / 15.3 / 14.2 / 15.0, L\* monotone                               |
| `sequential5`, adjacent                                             | 11.9 / 9.0 / 11.0 / 13.2, L\* monotone                                |
| `diverging5`, adjacent                                              | 24.3 / 22.4 / 21.6 / 20.5, centre-peaked                              |
| `coach`, `attendance`                                               | min ΔE 18.8 and 22.0 respectively, worst case across all four visions |
| `attendance` + Not stated, `day` (9 fills) (#1787)                  | 19.7 / 13.4 / 18.5 / 12.6 and 16.1 / 11.8 / 14.0 / 12.3               |
| Worst label contrast on any fill                                    | 4.82:1 (ink on `#2A8F6E`)                                             |

The validator also caught a bad first draft. The draft drew "Done" in a pale green, and under protan and deutan simulation it was only ΔE 4.3 from the grey "Not available". That is why "Not available" is now a **shape** (◌ hollow ring) and never a fill.

### 6.3 Basemap colours (handed to #1786)

The fills are validated against these land and water values. #1786's brand-token styles must adopt them, or re-run the validator with its own values:

- **Light:** land `#FFFFFF` (`--surface`), water `#CBDDE7` (`--loyal-100`).
- **Dark:** land `#161F2A` (`--surface-2`), water `#0A0F15` (`--bg`).
- **#2080 (2026-10-15):** re-tuned from the warm `--rt-paper` beige (light `#F4F1EB` / `#C9D7E0`, dark `#1A1816` / `#1E2A33`) to the app's cool neutrals, because new pages match the existing palette until the Phase 2 re-skin. The validator (`mapPalette.test.ts`, `choroplethScale.test.ts`) was re-run: pins pass unchanged. No cool neutral land other than white stays ≥ ΔE 8 from the choropleth's lowest bin under every CVD simulation, so light land is white and the choropleth's lowest bin is `#D6E6F3` (one step deeper than `sequential5`'s `#DCE9F5`); its light sea is `--tm-cool-gray`. In dark, the `--loyal-100` tint sat within ΔE 8 of the ramp, so water is the page `--bg`.
- **#2087 (2026-10-16):** the pin outline is now the app's slate `--ink-2` in each theme (light `#344052`, dark `#C8D1DD`; was the warm `--rt-ink-2` / `--rt-paper`), and the halo is the land surface (dark `--surface-2` `#161F2A`; was `--rt-bg-2`). The world map's marker outline matches. The outline still clears 3:1 on land and water, and the world map's light sea at 4.84:1.
- **Roads and labels:** desaturated, and at least ΔE 10 quieter than any pin fill. Basemap labels stay below the pin layers.

## 7. Many-category modes (division, area, district, region, meeting day)

Eight hues cannot identify 34 areas or 94 districts, so **colour separates and labels identify**.

1. **Assign colours by adjacency, not by hash.** Build a neighbour graph of territories: two territories are neighbours if a Delaunay edge joins a club of one to a club of the other. Colour it greedily with the 8 `categorical8` hues (Welsh–Powell order, ties broken by territory id), so the result is deterministic and stable from day to day until a realignment. Neighbours never share a hue. Hashed palettes are rejected: with 8 hues and about 5 neighbours per area, a hash makes neighbouring areas share a colour by chance, which is the one case that matters. Meeting day (7 + 2 categories) is small enough to use fixed weekday colours.
2. **Territory labels.** Each division, area, district or region gets a label at the pole of inaccessibility of its clubs' concave hull. The labels are 14 px with a halo, at these zooms: region z 1–4, district z 3–7, division z 7–11, area z 9–13. Optionally a 1 px hull outline in the territory hue at 40 % opacity is drawn too: decoration, not data.
3. **On-pin codes.** At z ≥ 11, pins become badges carrying the code (`B`, `B12`, `61`), with symbol collision on. The code is the non-colour channel, so a deuteranope reads "B12" rather than a hue.
4. **Legend as a finder.** The legend shows the 5 categories with the most clubs in the current view, then "N more". "N more" opens the full list: grouped (areas under their division), searchable, with counts. Hovering or focusing a chip outlines that territory's pins. Pressing a chip filters to it. Division and area chips write the Clubs table's `?divisions=` / `?areas=` keys, so the same link filters the list view.

## 8. Clustering at 13–15k clubs

- **Engine:** MapLibre GeoJSON source clustering (supercluster), one source per loaded region shard set (#1800). `clusterProperties` holds a per-category count for the **active** mode, for example `h_int: ['+', ['case', ['==', ['get','h'], 'i'], 1, 0]]`. A mode change rebuilds the source; the index builds in about 100 ms for 15k points, which #1809 measures.
- **What a cluster shows** (#1785 mobile AC (c): dominant category plus count; proportional rings are unreadable at 20 px):
  - **Fill:** the dominant category for categorical and status modes. For ordinal, sequential and diverging modes it is the **median bin**, because "dominant" is arbitrary across ordered bins.
  - **Count:** 14 px bold, in the validator's label colour for that fill.
  - **Size:** 32, 40 or 48 px for under 10, 10–99 and 100+ clubs. The hit area is always ≥ 44 px.
  - **Attention pip:** a 12 px pip on the rim at 45°, in the exception category's shape and colour. It appears when at least one member is in the mode's exception category and that category is not already the fill. The exception categories are ■ intervention (health), ■ needs action (compliance), ■/⊘ (status) and ● coach active (coach). It keeps "dominant thriving, but 3 intervention" visible without a ring chart.
  - **`aria-label`:** "Cluster of 142 clubs: 85 intervention required, 47 vulnerable, 10 thriving. Press Enter to zoom in."
- **Thresholds:**
  - `clusterRadius` 44 px, so pins cluster only when their 44 px targets would overlap.
  - `clusterMinPoints` 2 at district level and 3 at region and world level.
  - `clusterMaxZoom` 13, so individual pins always show from z 14.
  - A district map (≤ ~300 clubs) opens at its fitted bounds, where most pins are already single. The world map opens at z 1–2 with about 30–60 clusters.
- **Co-located clubs** (same building) never separate by zooming. At max zoom a "3" stack badge opens the sheet listing them. There is no spiderfy.
- **Cluster legend:** the legend line adds "Clusters show the most common category (median for ranges) · ■ marks clusters containing intervention-required clubs".

## 9. URL state

- **`?color=<id>`.** The value is one of the ids in §4. The default `health` is omitted from the URL, which follows the shipped club grid (`DistrictGridPage.tsx`: `parseColorMode`, which deletes `color` when the mode is health). `tier` keeps the grid's id, so a grid link and a map link mean the same thing. The value is **whitelisted at the parse**: an unknown id, or a mode the level doesn't offer (for example `area` on the world map), falls back to `health` (Lessons 124/144). Changing the mode keeps every filter.
- **Filters compose with the colour mode** (#1788) and reuse the Clubs-table contract (`clubFilterUrl.ts`):
  - `?status=thriving,vulnerable,intervention` for health
  - `?divisions=` / `?areas=` for division and area
  - `?search=`
  - Modes without an existing key get one named after the mode (`?size=`, `?dcp=`, `?csp=` …).
- **Other parameters:** `?view=list` (#1784).

## 10. Mobile (375) and responsive layout

| Width    | Layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **375**  | `ContextBar` (#1831) above a full-bleed map (`100dvh` minus chrome). The "Colour: Health ▾" pill and search sit over the map's top edge. The legend lives in a **non-modal map sheet** with three detents: **peek 96 px** (one-row chip strip that scrolls sideways with a fade cue, ≤ 6 chips visible, "N more"), **half** (all chips with counts, plus the selected club's summary when there is one) and **full** (not-on-the-map list, prospective clubs, "Not available" reasons). Chips are ≥ 44 px and text is ≥ 14 px |
| **768**  | The sheet becomes a 320 px side panel on the right. The mode picker is a popover                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **1280** | Side panel with the legend on top and the selected club below, as in the feature-design sketch. The quick toggle "Health \| Distinguished" sits beside the picker pill                                                                                                                                                                                                                                                                                                                                                        |

The existing `BottomSheet` is **modal** (`aria-modal`, `variant: 'default' | 'full'`). The map's legend sheet must leave the map interactive at peek and half, so #1784 needs a non-modal detent variant (a `role="region"` landmark rather than a dialog). The mode **picker** keeps using the modal sheet.

## 11. Decisions (2026-10-12)

Approved 2026-10-12. Ron decided items 4 and 5. Items 1–3 follow the orchestrator's default, which is to stay consistent with the keys the site already uses.

1. **URL key: `?color=`**, not `?mode=`. It matches the shipped club grid (`?color=tier`) and avoids confusion with `?view=list`. The #1784 and #1788 issue bodies were updated to match.
2. **Health filter key: `?status=`**, not `?health=`. It is the Clubs table's key (health values, with `intervention` as the alias), so one link filters both the map and the list.
3. **"Vulnerable / intervention" is folded into the health legend.** It is a legend filter plus a "Needs attention" chip, not a separate mode.
4. **Prospective clubs (Ron):** shown as a **count and a list in the map's side panel / sheet**. There is **no pipeline geocoding**, and they are not pinned.
5. **Distinguished pins use light blue `#7FB8D9` (Ron).** The tier ramp stays ordinal, and green keeps meaning "healthy".

## 12. UX persona review (ron-ux, recorded)

| Heuristic               | Finding                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility of status    | The legend carries the "as of" date and counts. "Not available" and "Not on the map" are explicit, never silent                                                                    |
| Match the real world    | The labels are TI's own words: Distinguished / Select / President's / Smedley, "Club Success Plan", "Officer list"                                                                 |
| Consistency             | Same ids, glyph meanings and filter keys as the club grid and the Clubs table                                                                                                      |
| Recognition over recall | Picker rows show swatches and shapes. The legend is always visible at peek                                                                                                         |
| Error prevention        | Unknown `?color=` falls back safely. April renewals cannot show a stale "done"                                                                                                     |
| Accessibility           | 1.4.1 (shape, fill level or label on every mode), 1.4.11 (outline ≥ 7.59:1), 1.4.3 (cluster text ≥ 4.82:1), 2.5.5 (44 px targets), keyboard path, list alternative, reduced motion |
| Mobile                  | One-thumb peek legend. Picker in the sheet. No pin-anchored popups                                                                                                                 |
| Residual risk           | Fill-level glyphs at 12 px are subtle at world zoom. Mitigations: the median-bin cluster fill and the legend. #1809 should test this with a real user at 375                       |

Mock-ups are in the PR: palette swatches with CVD simulations; the legend in light and dark; the 1280 and 768 layouts; and 375 at all three detents in light and dark, drawn from real D61 2026-10-11 coordinates and health.
