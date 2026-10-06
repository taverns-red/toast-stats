# CEO-oracle residuals — attribution club by club (#1535, parent #1429)

**Date:** 2026-10-06 · **Type:** read-only investigation (no code, no GCS writes,
no workflow dispatch) · **Data:** prod `gs://toast-stats-data-ca/snapshots/{2022,2023,2024,2025,2026}-06-30/`
as rebuilt 2026-10-04 (#1622 / #1611 / #1609), plus fresh fetches of TI's own
`dashboards.toastmasters.org/{PY}/export.aspx` made 2026-10-06.

## Verdict

| PY      | Residual(s)                         | Verdict                                                                  | Cause                                                                                                                                                                                                                                                                         |
| ------- | ----------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2021-22 | S -1, P -2, Total -3, Paid -7 of -8 | **Explained — our defect (data, not calculator)**                        | Archive captured TI's June close as of **2022-07-25**; TI kept publishing that close until **2022-07-28**. Seven named clubs (below) changed in those three days. At TI's final as-of, every tier reproduces the CEO Report exactly.                                          |
| 2021-22 | Paid -1 (the 8th)                   | **Unexplained, bounded — TI-side**                                       | CEO 14,749 exceeds every value TI's dashboard ever served for that close (final 14,748, flat 07-26..07-28). No public surface carries the 14,749th club.                                                                                                                      |
| 2022-23 | D -1, S -1, Total -2, Paid -5       | **Explained as TI-internal (report ≠ dashboard); not club-attributable** | Archive = TI's final as-of (07-19), byte-identical to today's fetch. CEO's S 1,260 and Paid 14,271 exceed every daily value TI published (07-01..07-19). The report was cut from TI records after the dashboard stopped publishing.                                           |
| 2024-25 | D -1, Total -1                      | **Explained — TI-internal (report cut earlier than dashboard final)**    | CEO tiers (1,827 / 1,274 / 3,636 / 6,737) equal TI's dashboard as of **2025-07-14** exactly; three named clubs moved tier between 07-14 and the final 07-20. Archive = final, byte-identical to today's fetch.                                                                |
| 2024-25 | Paid **+1**                         | **Explained — TI-internal; bounded to one of three named clubs**         | CEO 13,833 lies strictly between TI's 07-15 (13,831) and 07-16 (13,834) publications. The 07-15→07-16 step is exactly three new charters (D07 28678478, D53 28678602, D92 28679016). The report counted two of them; which one it missed is not recoverable from public data. |

**Hypothesis "the 2026-10-04 rebuild fixes the residuals" — refuted.** Re-run on
the rebuilt archive, the oracle prints the same 11 findings, digit for digit, as
CI run 32599614265 (pre-rebuild). The #1622/#1611/#1609 fixes touched retention,
20-Plus and Leadership Excellence — none of the fields the oracle reads.

**No calculator defect anywhere.** In every year our club tallies equal TI's
own district-summary totals for the as-of date we archived, and in every year a
club-level diff of the archive against a fresh TI fetch at the same as-of finds
zero differences (§3). `distinguishedDistricts` matches in all five years.

**One correction to the record:** #1464 refuted "pre-final capture" by showing
every `sourceCsvDate` is 19–30 days after June 30 and that lag doesn't order
with the deltas. That test measured the wrong thing. The question is not "how
long after June 30" but "before or after **TI's last as-of for that close**".
Measured that way, 2021-22 _is_ pre-final (07-25 vs TI's 07-28), and the
hypothesis explains 7 of its 8 paid clubs and all of its tier deltas.

## 1. Re-measure on current data

`npx tsx scripts/validate-vs-ceo-report.ts --cache-dir <scratch>` over the five
rebuilt year-ends (all `collectedAt` 2026-10-04):

```
2021-2022  S 994 (-1)  P 3,756 (-2)  Total 5,724 (-3)  Paid 14,741 (-8)
2022-2023  D 1,597 (-1)  S 1,259 (-1)  Total 6,460 (-2)  Paid 14,266 (-5)
2023-2024  exact
2024-2025  D 1,826 (-1)  Total 6,736 (-1)  Paid 13,834 (+1)
2025-2026  exact (incl. Smedley 1,912)
RESULT: 11 finding(s)
```

Identical to the pre-rebuild CI runs. Districts 8/18/33/37/42 all match, 0 Unknown.

## 2. TI's daily as-of series for each June close

TI's archived dashboards still serve every daily as-of of a closed month:
`/{PY}/export.aspx?type=CSV&report=districtsummary~6/30/{Y}~7/{d}/{Y}~{PY}`.
An as-of after the last publication returns a 408-byte header-only body. Summing
every district row (all districts including `F` and `U`):

**2021-22** (archive as-of 07-25; CEO: D 974 · S 995 · P 3,758 · Tot 5,727 · Paid 14,749)

| as-of                | Paid   | D     | S       | P         | Total     |
| -------------------- | ------ | ----- | ------- | --------- | --------- |
| 07-22                | 14,732 | 973   | 994     | 3,755     | 5,722     |
| **07-25 (archive)**  | 14,741 | 974   | 994     | 3,756     | 5,724     |
| 07-26                | 14,748 | 974   | **995** | **3,758** | **5,727** |
| 07-27                | 14,748 | 974   | 995     | 3,758     | 5,727     |
| **07-28 (TI final)** | 14,748 | 974   | 995     | 3,758     | 5,727     |
| 07-29+               | —      | empty |         |           |           |

**2022-23** (archive = final 07-19; CEO: D 1,598 · S 1,260 · P 3,604 · Tot 6,462 · Paid 14,271)

| as-of                         | Paid   | D     | S     | P     | Total |
| ----------------------------- | ------ | ----- | ----- | ----- | ----- |
| 07-14                         | 14,215 | 1,599 | 1,258 | 3,604 | 6,461 |
| 07-17                         | 14,245 | 1,599 | 1,258 | 3,604 | 6,461 |
| 07-18                         | 14,260 | 1,598 | 1,258 | 3,605 | 6,461 |
| **07-19 (archive, TI final)** | 14,266 | 1,597 | 1,259 | 3,604 | 6,460 |
| 07-20+                        | —      | empty |       |       |       |

Max S over 07-01..07-19 is 1,259; max Paid is 14,266. The CEO's 1,260 and
14,271 appear on no day TI published. Paid was still rising ~6–15/day when the
dashboard stopped, consistent with the report being cut ~1 day later from
TI's internal records.

**2024-25** (archive = final 07-20; CEO: D 1,827 · S 1,274 · P 3,636 · Tot 6,737 · Paid 13,833)

| as-of                         | Paid   | D         | S         | P         | Total     |
| ----------------------------- | ------ | --------- | --------- | --------- | --------- |
| 07-11..07-13                  | 13,810 | 1,827     | 1,274     | 3,636     | 6,737     |
| **07-14**                     | 13,822 | **1,827** | **1,274** | **3,636** | **6,737** |
| 07-15                         | 13,831 | 1,827     | 1,273     | 3,637     | 6,737     |
| 07-16                         | 13,834 | 1,826     | 1,274     | 3,637     | 6,737     |
| **07-20 (archive, TI final)** | 13,834 | 1,826     | 1,274     | 3,636     | 6,736     |

No single as-of reproduces the CEO tuple: its tiers are the 07-11..07-14 state,
its paid count sits between 07-15 and 07-16. The report mixes two cuts.

**Calibration (exact years).** 2023-24: TI's last as-of is 07-19 = archive, and
the CEO matches it on every metric. 2025-26: archive 07-25, TI's June-2026 list
ends 07-16 with 07-16..07-25 byte-identical (`docs/month-end-closing-dates.json`
note, #1620) — exact. So where our archive holds TI's final close, the CEO
Report matches it in two of four years and differs by a few clubs in the other two.

## 3. Club-level diff — archive vs fresh TI fetch at the archived as-of

Canary script fetched `clubperformance~{district}~6/30/{Y}~{as-of}~{PY}` for every
district in each year-end snapshot and diffed each row (all 23 columns) against
`data.clubPerformance` in our archive.

| PY                    | Snapshot   | As-of fetched | Districts | Clubs (archive / fresh) | Rows differing |
| --------------------- | ---------- | ------------- | --------- | ----------------------- | -------------- |
| 2021-22               | 2022-06-30 | 2022-07-25    | 125       | 17,033 / 17,033         | **0**          |
| 2022-23               | 2023-06-30 | 2023-07-19    | 128       | 16,203 / 16,203         | **0**          |
| 2023-24 (calibration) | 2024-06-30 | 2024-07-19    | 130       | 15,679 / 15,679         | **0**          |
| 2024-25               | 2025-06-30 | 2025-07-20    | 132       | 15,261 / 15,261         | **0**          |

Verdict per year: **`faithful-mirror`** in all four. Our archive is exactly
what TI's dashboard serves today for the as-of we captured — every club, every
column. Our tier tallies also equal the summary file's district totals (e.g.
2022-23: 1,597 / 1,259 / 3,604 / 6,460, Paid 14,266 on both sides). To
falsify: fetch any district's `clubperformance` at the as-of above and diff it
against `data.clubPerformance` in that snapshot's `district_{id}.json`.

District summaries: today's fetch of `districtsummary` at the archived as-of is
byte-identical to the copy in `raw-csv/` captured 2026-03-22 for 2022-23
(07-19), 2023-24 (07-19) and 2024-25 (07-20). TI has not restated these closes
in the 6½ months that span the CEO Report's August 2026 publication.

## 4. The named clubs

**2021-22 — what changed between our 07-25 capture and TI's final 07-28**
(fresh `clubperformance` at 07-28 vs archive, only the eight districts the
summary bisection flagged):

| District | Club     | Change                                     | Oracle field |
| -------- | -------- | ------------------------------------------ | ------------ |
| 104      | 01426276 | Distinguished '' → **P** (18 → 20 members) | P +1         |
| 118      | 06962288 | '' → **P** (19 → 20 members)               | P +1         |
| 48       | 02709335 | '' → **S** (18 → 20 members)               | S +1         |
| 118      | 08001221 | new row (charter)                          | Paid +1      |
| 118      | 08001238 | new row (charter)                          | Paid +1      |
| 59       | 07776982 | new row                                    | Paid +1      |
| 67       | 01298297 | Suspended → **Active** (reinstated)        | Paid +1      |
| 82       | 28675430 | new row (charter)                          | Paid +1      |
| 85       | 28675405 | new row (charter)                          | Paid +1      |
| 94       | 28675411 | new row (charter)                          | Paid +1      |

S +1, P +2, Total +3, Paid +7 — exactly the oracle's -1/-2/-3 and 7 of the -8.
The residual Paid -1 (14,748 vs 14,749) is beyond TI's final dashboard.

**2024-25 — tiers: what moved after TI's 07-14 state (= CEO)**

| District | Club     | 07-14 → final 07-20          | Net effect     |
| -------- | -------- | ---------------------------- | -------------- |
| 104      | 07786305 | **D** → '' (16 → 15 members) | D -1, Total -1 |
| 79       | 05399084 | **P** → '' (20 → 19 members) | P -1, Total -1 |
| 79       | 28678830 | '' → **D**                   | D +1, Total +1 |
| 70       | 00009411 | D → **S**                    | D -1, S +1     |
| 40       | 01684414 | S → **P**                    | S -1, P +1     |

Net D -1, S 0, P 0, Total -1 — exactly the oracle's 2024-25 tier residuals.

**2024-25 — the +1 paid club.** The 07-15 → 07-16 step (13,831 → 13,834) is,
district by district, D07 +1, D53 +1, D92 +1 and nothing else; club by club it
is three new rows: **D07 28678478 "MKS Precision Persuaders"**, **D53 28678602
"NYS SNUG Toastmasters"**, **D92 28679016 "CHII Toastmasters Club"**. The CEO's
13,833 counts two of the three. Which one it omits — or whether the report's
paid figure is a mid-day cut — is not recoverable from any public TI surface.
That bounds the +1 to a named set of three; it is not a club our transform
double-counts (each appears once, in its own district, on TI's own dashboard).

## 5. Hypotheses tested

| #   | Hypothesis                                                                                   | Test                                                                                 | Result                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H0  | The 10-04 rebuild (#1622/#1611/#1609) changes the residuals                                  | Re-run oracle on rebuilt archive                                                     | **Refuted** — identical 11 findings                                                                                                                                                                                         |
| H1  | Our transform drops/adds clubs or misclassifies tiers                                        | Archive tallies vs TI district-summary totals at the same as-of; club-level row diff | **Refuted** — equal in every year; 0 differing rows across 64,176 clubs                                                                                                                                                     |
| H2  | Undistricted (`U`) / Founders (`F`) clubs are missing from our rankings                      | Inspect rankings ids vs summary rows                                                 | **Refuted** — both present in every year                                                                                                                                                                                    |
| H3  | TI restated the dashboard after our capture                                                  | Fresh fetch vs `raw-csv` (captured 2026-03-22)                                       | **Refuted** — byte-identical                                                                                                                                                                                                |
| H4  | Archive captured a pre-final as-of (re-framed vs TI's last as-of, not vs June 30)            | Probe every July as-of per close                                                     | **Confirmed for 2021-22** (07-25 vs 07-28; explains 10 of 11 club-units there). Not the cause in 2022-23/2024-25 (archive = final)                                                                                          |
| H5  | CEO Report was cut from TI-internal records at a different moment than the dashboard's final | Search the daily series for the CEO tuple                                            | **Confirmed for 2024-25** (tiers = 07-14 state; paid between 07-15/07-16). **Consistent for 2022-23** (CEO exceeds every published day — post-freeze cut) and the 2021-22 Paid -1. Not club-attributable for those last two |
| H6  | Contemporaneous Wayback captures distinguish "always said this"                              | Wayback CDX for `dashboards.toastmasters.org*` 2022-07..2025-08                      | **Inconclusive** — only root-page captures, no exports or year-end figures. Recorded limitation                                                                                                                             |

## 6. Defect class found: closing registry pinned to a non-final as-of

`docs/month-end-closing-dates.json` maps each data month to "the last
closing-period collection date in raw-csv/". For years collected monthly, that
is the date of _our_ crawl, not TI's last publication. Probing every June close
2017–2026 for the last populated as-of:

| June close | Registry | TI last as-of                       | Stale?                     |
| ---------- | -------- | ----------------------------------- | -------------------------- |
| 2017       | 07-24    | 07-24                               | no                         |
| 2018       | 07-23    | 07-23                               | no                         |
| 2019       | 07-16    | **07-17**                           | yes (Paid +1: D75)         |
| 2020       | 07-12    | 07-12                               | no                         |
| 2021       | 07-18    | 07-18                               | no                         |
| 2022       | 07-25    | **07-28**                           | yes (the 2021-22 residual) |
| 2023       | 07-19    | 07-19                               | no                         |
| 2024       | 07-19    | 07-19                               | no                         |
| 2025       | 07-20    | 07-20                               | no                         |
| 2026       | 07-25    | 07-16 (list), data final from 07-16 | no (#1620)                 |

Non-June months were not probed. A rebuild of `snapshots/2022-06-30` from the
2022-07-28 close would, by §2, make 2021-22 match the CEO Report on every tier
and leave Paid at -1.

## 7. Recommendation for #1429

**Keep open with one named data defect; close the rest as explained.**

1. **Named defect (fixable, ours):** the 2022-06 (and 2019-06) closing-registry
   entries point at a non-final as-of. File a sprint: correct the registry to
   TI's last as-of (07-28 / 07-17), rebuild those year-ends under the #1619
   guard, then re-run the oracle. Expected after: 2021-22 → Paid -1 only.
   Worth a registry-wide audit (every month, not just June) using the same
   "last populated as-of" probe.
2. **Explained, TI-internal (not fixable from our side):** 2022-23's four
   findings and 2024-25's three. Our archive is a byte-faithful mirror of TI's
   final dashboard; the CEO Report was compiled from a different cut. Any
   oracle tolerance for these must be per-year and per-metric, citing this
   doc — never a blanket band (R1). That decision is the operator's (#1535 is
   out of scope for it).
3. **Calculators:** confirmed. No change.

## Method and reproducibility

All probes were read-only HTTP GETs to TI's public export endpoint and
`gcloud storage cp/cat` from the prod bucket into a scratch directory. The
canary scripts (summary series fetch, per-district bisection, club-level diff)
lived in the session scratchpad and were deleted; the URLs above are sufficient
to reproduce every number. TI was fetched at ≤4 concurrent requests.
