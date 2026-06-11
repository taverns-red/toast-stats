# Investigation — Historical Distinguished District Program rules (2016-17 → 2025-26)

**Issue:** #1116 item 5 · **Date:** 2026-06-10 · **Confidence:** high (all 10 years)
**Method:** multi-agent research over Item 1490 revisions + archive.org, adversarially
verified, then **back-solved against TI's own frozen dashboard goal numbers** for multiple
districts per year (exact and discriminating — e.g. D61 2022-23 club goals 178/179/184/187
match only the Rev. 12/2022 asymmetric ladder, refuting the symmetric 1.5% reading).
Implemented by `DistinguishedDistrictCalculator.rulesetForProgramYear` (per-era rulesets).

## Era summary

| Era               | Tiers                                                | Payments growth  | Club requirement              | % Distinguished (of club base) |
| ----------------- | ---------------------------------------------------- | ---------------- | ----------------------------- | ------------------------------ |
| 2016-17 → 2017-18 | D / S / P (no Smedley)                               | 3 / 5 / 8%       | 3 / 5 / 8%                    | 40 / 45 / 50                   |
| 2018-19 → 2021-22 | D / S / P / Smedley (Smedley's first district years) | 1.5 / 3 / 5 / 8% | 1.5 / 3 / 5 / 8%              | 40 / 45 / 50 / 55              |
| 2022-23 → 2024-25 | D / S / P / Smedley (Rev. 12/2022, asymmetric)       | 1 / 3 / 5 / 8%   | no-net-loss / net+1 / 3% / 5% | 40 / 45 / 50 / 55              |
| 2025-26 →         | D / S / P / Smedley (current, §13)                   | 1 / 3 / 5 / 8%   | 1 / 3 / 5 / 8%                | 45 / 50 / 55 / 60              |

**Prerequisites:** exactly two hard gates 2016-17 → 2024-25 (DSP to WHQ by Sep 30;
Division & Area Director training report by Sep 30 showing 85% trained) — matching the
only prerequisite columns (`DSP`, `Training`) in TI's pre-2025-26 all-districts CSV
exports. 2025-26 adds Market Analysis Plan, Communication Plan (both Sep 30), and ≥2
Region Advisor meetings (May 31): five gates, fail-one-fail-all.

**Common mechanics (all 10 years):** club base = paid clubs as of July 1; payments base =
prior-PY July-June WHQ receipts (both upward-revisable in-year); %-distinguished
denominator is the **club base**, never year-end paid clubs; goals round **up** (ceil);
final determination at June 30.

**Corrections to prior in-repo assumptions:**

1. _"Smedley Distinguished is new for the 2025-2026 program year"_ (rules-reference §13.2,
   calculator header, #329) — Smedley has existed at **district** level since **2018-19**;
   2025-26 changed its thresholds (club growth 5%→8% via the symmetric ladder; %-dist
   55%→60%) and raised every tier's %-distinguished by 5 points.
2. COVID years: the Board explicitly declined to relax the DRP in 2019-20 and 2020-21
   (only one-off supplemental awards and, in 2020-21, a paid-club-definition waiver).

## Per-year detail (research synthesis, verbatim requirements + verification)

### 2016-2017 — confidence: high

- **Distinguished District** — Net paid-club growth >= 3% of club base AND net membership-payments growth >= 3% of payments base AND Distinguished clubs (Distinguished+Select+President's) >= 40% of club base. Club base = paid clubs as of July 1 (April renewals + Apr 1–Jun 30 charters, upward-revisable); payments base = prior-PY Jul 1–Jun 30 WHQ receipts (revisable); %-distinguished denominator = club base; goals round UP; measured at June 30. Verified: D61 base 201 clubs/8,371 payments → goals 208/8,623/81.
- **Select Distinguished District** — 5% net club growth AND 5% net payments growth AND 45% of club base Distinguished. Verified: D61 goals 212/8,790/91.
- **President's Distinguished District** — 8% net club growth AND 8% net payments growth AND 50% of club base Distinguished. Verified: D61 goals 218/9,041/101. NO Smedley tier this year (3-tier ladder); no district no-net-loss gate — positive growth required at every tier, in-year losses must be recuperated by June 30.
- _Prerequisites:_ Two hard gates: (1) District Success Plan to WHQ by Sep 30; (2) Division & Area Directors Training Report to WHQ by Sep 30 showing 85% trained. (Gates proven by TI's 2016-17 CSV carrying only DSP+Training columns; 85%/Sep-30 parameters carried on Item 1475 Rev. 3/2015.) Best source: https://dashboards.toastmasters.org/2016-2017/District.aspx?id=61

### 2017-2018 — confidence: high

- **Distinguished District** — 3% net club growth AND 3% net payments growth AND 40% of club base Distinguished. Same denominators/round-up as 2016-17. Verified: D61 base 194/7,908 → goals 200/8,146/78 (rounding uniquely excludes 1.5%, which would give 197).
- **Select Distinguished District** — 5% / 5% / 45%. Verified: goals 204/8,304/88.
- **President's Distinguished District** — 8% / 8% / 50%. Verified: goals 210/8,541/97. NO Smedley tier; no district no-net-loss gate.
- _Prerequisites:_ Same two hard gates: DSP to WHQ by Sep 30; Division & Area Directors Training Report by Sep 30 showing 85% trained. Best source: https://dashboards.toastmasters.org/2017-2018/District.aspx?id=61

### 2018-2019 — confidence: high

- **Distinguished District** — 1.5% net membership-payments growth AND 1.5% net club growth AND Distinguished clubs >= 40% of club base. Same denominators (club base Jul 1; payments base = prior-PY receipts; %-dist vs club base; ceil). Verified: D61 base 190/7,276 → 193/7,386/76; D82 base 272/15,842 → 277/16,080/109.
- **Select Distinguished District** — 3% payments / 3% clubs / 45%. Verified: D61 196/7,495/86; D82 281/16,318/123.
- **President's Distinguished District** — 5% payments / 5% clubs / 50%. Verified: D61 200/7,640/95; D82 286/16,635/136.
- **Smedley Distinguished District** — 8% payments / 8% clubs / 55% — FIRST YEAR this tier exists at District level (Board modified the program mid-year, announced ~Jan 8 2019 for 2018-19 and 2019-20; governed the full-year determination). Verified: D61 206/7,859/105; D82 294/17,110/150. No district no-net-loss gate.
- _Prerequisites:_ Two hard gates (Item 1490 Rev. 02/2019 verbatim): Division & Area Directors Training Report to WHQ by Sep 30 showing 85% trained; District Success Plan to WHQ by Sep 30. Best source: https://web.archive.org/web/20190612010153/http://www.toastmasters.org/-/media/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.ashx

### 2019-2020 — confidence: high

- **Distinguished District** — 1.5% net payments growth AND 1.5% net club growth AND 40% of club base Distinguished. Verified: D61 base 188/7,369 → 191/7,480/76.
- **Select Distinguished District** — 3% / 3% / 45%. Verified: 194/7,591/85.
- **President's Distinguished District** — 5% / 5% / 50%. Verified: 198/7,738/94.
- **Smedley Distinguished District** — 8% / 8% / 55%. Verified: 204/7,959/104. COVID: Board explicitly DECLINED to lower 2019-20 requirements/goals; created 2019-20-only supplemental awards (Online Ovation, Visiting Victor, Paid Club Champion, etc.) measured May 1–Jun 30 2020 — separate awards, not tier changes. No district no-net-loss gate.
- _Prerequisites:_ Same two hard gates per Item 1490 Rev. 02/2019 (in force entering 2019-20): DSP by Sep 30; training report by Sep 30 showing 85% trained. Best source: https://dashboards.toastmasters.org/2019-2020/District.aspx?id=61

### 2020-2021 — confidence: high

- **Distinguished District** — 1.5% net membership-payments growth AND 1.5% net club growth AND 40% of club base Distinguished. Same denominators/ceil. Dashboard back-solve (synthesis re-check): D61 base 192/7,527 → 195/7,640/77.
- **Select Distinguished District** — 3% / 3% / 45%. Back-solved: 198/7,753/87.
- **President's Distinguished District** — 5% / 5% / 50%. Back-solved: 202/7,904/96.
- **Smedley Distinguished District** — 8% / 8% / 55%. Back-solved: 208/8,130/106. COVID: DRP explicitly unchanged (TI letter Apr 2 2021); only relaxation was the paid-club definition for Oct 2020/Apr 2021 renewals (8 members, 3-renewing-members waived) — no threshold changes. No district no-net-loss gate.
- _Prerequisites:_ Two hard gates (Item 1490 Rev. 03/2020 p.38): training report by Sep 30 showing 85% of Division/Area Directors trained; DSP by Sep 30. Best source: https://web.archive.org/web/20210224123904/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf

### 2021-2022 — confidence: high

- **Distinguished District** — 1.5% net payments growth AND 1.5% net club growth AND 40% of club base Distinguished. Dashboard back-solve (synthesis re-check): D61 base 188/6,129 → 191/6,221/76.
- **Select Distinguished District** — 3% / 3% / 45%. Back-solved: 194/6,313/85.
- **President's Distinguished District** — 5% / 5% / 50%. Back-solved: 198/6,436/94.
- **Smedley Distinguished District** — 8% / 8% / 55%. Back-solved: 204/6,620/104. Same denominators/ceil; no district no-net-loss gate.
- _Prerequisites:_ Same two hard gates verbatim (Item 1490 Rev. 01/2021, posted as 'updated 5/2021'): training report 85% by Sep 30; DSP by Sep 30. Best source: https://web.archive.org/web/20240626094143/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program_v2.pdf

### 2022-2023 — confidence: high

- **Distinguished District** — CORRECTED during synthesis (era research said 1.5% symmetric — refuted by TI's frozen dashboards): 1% net membership-payments growth (ceil(1.01 x payments base)) AND NO NET CLUB LOSS (year-end paid clubs >= club base) AND 40% of club base Distinguished. Verified two districts: D61 base 178/5,590 → goals 178 clubs (=base; 1.5% would give 181) / 5,646 payments (1.5% would give 5,674) / 72 dist; D13 base 65/2,083 → 65/2,104/26.
- **Select Distinguished District** — 3% net payments growth AND net PLUS ONE club (>= base+1) AND 45% of club base Distinguished. Verified: D61 179/5,758/81; D13 66/2,146/30.
- **President's Distinguished District** — 5% net payments growth AND 3% net club growth AND 50% of club base Distinguished. Verified: D61 184 (ceil(178x1.03)) / 5,870 / 89; D13 67/2,188/33.
- **Smedley Distinguished District** — 8% net payments growth AND 5% net club growth AND 55% of club base Distinguished. Verified: D61 187 (ceil(178x1.05)) / 6,038 / 98; D13 69/2,250/36. Structure documented in Item 1490 Rev. 12/2022 (published mid-PY); same base/denominator/ceil mechanics.
- _Prerequisites:_ Two hard gates — unaffected by the tier correction since both candidate revisions (Rev. 01/2022 and Rev. 12/2022) list the identical pair: training report 85% by Sep 30; DSP by Sep 30. Best source: https://dashboards.toastmasters.org/2022-2023/District.aspx?id=61 (tier proof; corroborated by id=13 and by Item 1490 Rev. 12/2022 at https://web.archive.org/web/20231210212449/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf)

### 2023-2024 — confidence: high

- **Distinguished District** — 1% net payments growth (ceil(1.01 x payments base)) AND no net club loss (year-end paid clubs >= club base) AND 40% of club base Distinguished. Same base definitions (club base Jul 1, revisable; payments base = prior-PY WHQ receipts; %-dist vs club base; ceil; Jun 30 final).
- **Select Distinguished District** — 3% net payments growth AND net plus one club (>= base+1) AND 45% of club base. Verified: D13 base 60/2,059 → 61/2,121/27.
- **President's Distinguished District** — 5% net payments growth AND 3% net club growth AND 50% of club base. Verified: D13 62/2,162/30.
- **Smedley Distinguished District** — 8% net payments growth AND 5% net club growth AND 55% of club base. Verified: D13 goals 63/2,224/33 (D13 earned Smedley: 63/2,253/34).
- _Prerequisites:_ Two hard gates (Item 1490 Rev. 12/2022): training report 85% by Sep 30; DSP by Sep 30. NO Market Analysis Plan / Communication Plan / Region Advisor gates. Best source: https://web.archive.org/web/20231210212449/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf

### 2024-2025 — confidence: high

- **Distinguished District** — 1% net payments growth AND no net club loss AND 40% of club base Distinguished. Verified: D13 base 63/2,255 → 63/2,278/26.
- **Select Distinguished District** — 3% net payments growth AND net plus one club AND 45% of club base. Verified: 64/2,323/29.
- **President's Distinguished District** — 5% net payments growth AND 3% net club growth AND 50% of club base. Verified: 65/2,368/32.
- **Smedley Distinguished District** — 8% net payments growth AND 5% net club growth AND 55% of club base. Verified: 67/2,436/35. Item 1490 Rev. 04/2024 — district section substantively identical to Rev. 12/2022.
- _Prerequisites:_ Two hard gates (Item 1490 Rev. 04/2024): training report 85% by Sep 30; DSP by Sep 30. Market Analysis Plan / Communication Plan / Region Advisor gates do NOT exist yet. Best source: https://web.archive.org/web/20241011084658/https://ccdn.toastmasters.org/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf

### 2025-2026 — confidence: high

- **Distinguished District** — 1% net membership-payments growth AND 1% net club growth AND 45% of club base Distinguished. The 1% club-growth floor REPLACES the former no-net-loss rule (no standalone no-net-loss option at District level). Club base = paid clubs Jul 1 (revisable for late April dues and pre-Oct-1 reinstatements); payments base = prior-PY Jul 1–Jun 30 WHQ receipts; ceil; Jun 30 final.
- **Select Distinguished District** — 3% net payments growth AND 3% net club growth AND 50% of club base Distinguished.
- **President's Distinguished District** — 5% net payments growth AND 5% net club growth AND 55% of club base Distinguished (worked example: base 105 → 110.25 → 111).
- **Smedley Distinguished District** — 8% net payments growth AND 8% net club growth AND 60% of club base Distinguished. CORRECTED per verification: NOT a new tier — Smedley has existed at District level since 2018-19; 2025-26 raises its club growth 5%→8% and %-distinguished 55%→60% (the new-for-2025-26 Smedley award is at CLUB level).
- _Prerequisites:_ FIVE hard gates (fail any one = no recognition): (1) Division & Area Directors Training Report by Sep 30 showing 85% trained; (2) District Success Plan by Sep 30; (3) District Market Analysis Plan by Sep 30; (4) District Communication Plan by Sep 30; (5) at least two Region Advisor meetings by May 31. Gates 3-5 are new for 2025-26 (matching the new CSV columns). Deadlines 11:59 p.m. Mountain Time via District Central. Best source: https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf

## Sources

- https://dashboards.toastmasters.org/2016-2017/District.aspx?id=61 — frozen PY2016-17 dashboard: 3 tiers; back-solves exactly to 3/5/8% clubs+payments and 40/45/50% distinguished (208/212/218 off base 201; 8,623/8,790/9,041 off 8,371; 81/91/101)
- https://dashboards.toastmasters.org/2017-2018/District.aspx?id=61 — frozen PY2017-18 dashboard: 3 tiers, 3/5/8% + 40/45/50% (200/204/210 off 194; 8,146/8,304/8,541 off 7,908; 78/88/97); rounding excludes 1.5%
- https://web.archive.org/web/20190612010153/http://www.toastmasters.org/-/media/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.ashx — Item 1490 Rev. 02/2019: verbatim 4-tier table (1.5/3/5/8%, 40/45/50/55%) and the two qualifying requirements for 2018-19 and 2019-20; base definitions, recuperate-losses, round-up rule; embeds Item 1475 (Rev. 3/2015) evidencing the 85%/Sep-30 gate back to 2016-17
- https://dashboards.toastmasters.org/2018-2019/District.aspx?id=61 — frozen PY2018-19 dashboard: 4 tiers incl. first Smedley; exact back-solve (193/196/200/206 off 190; 76/86/95/105); corroborated by id=82 (277/281/286/294 off 272)
- https://dashboards.toastmasters.org/2019-2020/District.aspx?id=61 — frozen PY2019-20 dashboard: same 4-tier formula (191/194/198/204 off 188; 7,480/7,591/7,738/7,959 off 7,369; 76/85/94/104)
- https://district1toastmasters.org/toastmasters-international-is-announcing-2019-initiatives/ — dates the Board's mid-year change (announced ~2019-01-08) introducing the 1.5% floor and Smedley for 2018-19/2019-20
- https://www.d26toastmasters.org/coronavirus-international-recognition-may-28-2020/ — Board kept 2019-20 requirements unchanged for COVID; supplemental awards only
- https://web.archive.org/web/20210224123904/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf — Item 1490 Rev. 03/2020 (full): PY2020-21 tiers 1.5/3/5/8% + 40/45/50/55% and the two gates
- https://dashboards.toastmasters.org/2020-2021/District.aspx?id=61 — fresh synthesis back-solve confirming PY2020-21 symmetric 1.5/3/5/8% + 40/45/50/55% (base 192/7,527 → 195/198/202/208; 7,640/7,753/7,904/8,130; 77/87/96/106)
- https://web.archive.org/web/20240626094143/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program_v2.pdf — Item 1490 Rev. 01/2021 (file TI posted for PY2021-22): identical thresholds + two gates
- https://dashboards.toastmasters.org/2021-2022/District.aspx?id=61 — fresh synthesis back-solve confirming PY2021-22 symmetric 1.5/3/5/8% + 40/45/50/55% (base 188/6,129 → 191/194/198/204; 6,221/6,313/6,436/6,620; 76/85/94/104)
- https://dashboards.toastmasters.org/2022-2023/District.aspx?id=61 — CORRECTION EVIDENCE: frozen PY2022-23 dashboard back-solves exactly to 1/3/5/8% payments + no-net-loss/+1/3%/5% clubs + 40/45/50/55% (base 178/5,590 → 178/179/184/187 clubs; 5,646/5,758/5,870/6,038 payments; 72/81/89/98), refuting the symmetric-1.5% assignment for 2022-23
- https://dashboards.toastmasters.org/2022-2023/District.aspx?id=13 — independent second-district confirmation of the 2022-23 correction (base 65/2,083 → 65/66/67/69; 2,104/2,146/2,188/2,250; 26/30/33/36)
- https://web.archive.org/web/20231210212449/https://toastmasterscdn.azureedge.net/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf — Item 1490 Rev. 12/2022: documents the 1%/no-net-loss/+1/3%/5% structure and two gates; governed PY2023-24 (archived mid-year) and matches the 2022-23 dashboard arithmetic
- https://dashboards.toastmasters.org/2023-2024/District.aspx?id=13 — frozen PY2023-24 dashboard: exact match to Rev. 12/2022 formulas (goals 60/61/62/63 clubs; 2,080/2,121/2,162/2,224 payments; 24/27/30/33); D13 earned Smedley
- https://web.archive.org/web/20241011084658/https://ccdn.toastmasters.org/medias/files/department-documents/district-documents/1490-toastmasters-international-district-recognition-program.pdf — Item 1490 Rev. 04/2024: PY2024-25, district section substantively identical to Rev. 12/2022; two gates
- https://dashboards.toastmasters.org/2024-2025/District.aspx?id=13 — frozen PY2024-25 dashboard: exact match (63/64/65/67 clubs; 2,278/2,323/2,368/2,436 payments; 26/29/32/35 off base 63/2,255)
- https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf — Item 1490 Rev. 03/2026: PY2025-26 tiers 1/3/5/8% (both metrics) + 45/50/55/60%, five qualifying gates, base definitions, round-up rule, MT deadline
- https://www.toastmasters.org/magazine/magazine-issues/2025/july/what-recognition-updates-mean — TI magazine (July 2025): 2025-26 deltas (1% club growth replaces no-net-loss; 45% up from 40%; Smedley 'already exists in the DRP' — basis of the Smedley-novelty correction; Market Analysis/Communication Plans + 2 RA meetings new)
- https://ccdn.toastmasters.org/medias/files/district-leader-tools/151-distinguished-districts-2023-2024.pdf — TI's official 2023-24 Smedley Distinguished Districts list (9 districts) proving the District-level Smedley tier pre-dates 2025-26
- https://web.archive.org/web/20210516192420/https://toastmasterscdn.azureedge.net/medias/files/department-documents/online-clubs/toastmasters-international-_-recognition-awards-_-2020-2021-additional-recognition.pdf — TI letter 2021-04-02: 2020-21 recognition programs 'will remain unchanged' (COVID awards were additional)
- https://dashboards.toastmasters.org/2016-2017/export.aspx?type=CSV&report=districtsummary~~6/30/2017~2016-2017 — all-districts CSV: gate columns exactly 'DSP','Training' (same header through 2019-20; corroborates two-gate prerequisites pre-2025-26)

## Residual caveats (from synthesis)

Residual caveats: (a) the 85%/Sep-30 parameters for 2016-17/2017-18 are carried on the Item 1475 form Rev. 3/2015 + 2017 FAQ rather than a 2016-dated manual (gates' existence proven by year-exact CSVs) — kept high per the era verification; (b) no period-archived mid-2022 manual was produced for 2022-23 (Rev. 12/2022 is dated mid-year), but two-district exact dashboard arithmetic is decisive about the rules actually applied, so kept high.
