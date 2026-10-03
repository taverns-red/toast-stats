# Education awards leaderboards: plan (approved 2026-10-01)

Two club rankings on the district **Analytics** tab, available in every district.
D61 gives these out as _Crowning Glory_ and _Team Spirit_.

| Ranking                          | Formula                                          | D61 name       |
| -------------------------------- | ------------------------------------------------ | -------------- |
| Education awards per base member | awards earned ÷ membership base                  | Crowning Glory |
| Members with an education award  | distinct members with ≥1 award ÷ membership base | Team Spirit    |

## Decisions (operator, 2026-10-01)

- **Awards counted:** every Pathways level award (L1–L5) plus DTM. A Level 5 is the path completion, so it counts **once**. TI has no separate path-completion award.
- **Denominator:** the club's July 1 membership base, for both rankings.
- **Eligibility:** base ≥ 8. Clubs below that (including new clubs with base 0) are listed as "not eligible", not ranked.
- **Ties:** shared rank (1, 1, 3).
- **Period:** program year to date, as of the viewed snapshot.
- **Display:** two cards, each showing the top 10, expandable to the full ranked list, with numerator and denominator visible.
- **Scope:** every district, under neutral names.

## Data: what exists and what's missing

- TI's Education Achievements daily report has **one row per award**: `Club, Division, Area, Award, Date, Member, Name, Location`, covering the program year to date.
- Today the collector drops `Member` and `Date` and aggregates to `{club, award, achievementCount}` (`DailyReportParser.ts:226-242, 385-424`).
  - **Crowning Glory** can be computed from that today.
  - **Team Spirit cannot**, because distinct members are lost at aggregation.

### Proposed privacy approach (changed from "pseudonymous IDs")

Count distinct members **inside the collector** and publish only the per-club count. No member identifier is stored or published, hashed or otherwise.

- New per-club aggregate: `{ club, membersWithAward }`. Award totals are not duplicated here; they come from summing `educationAchievements.achievementCount` per club.
- `Member` is read only in memory to build a `Set` per club, then thrown away.
- No salt or secret is needed. A plain hash of a member number would be brute-forceable; an HMAC would need a new secret. This avoids both.
- This gives exact Team Spirit numbers, the same accuracy as hashed IDs, without publishing pseudonymous identifiers.
- Trade-off: distinct counts can't be recomputed later at a different grain (e.g. per division). Acceptable.
- If the raw table has rows but lacks a `Club` or `Member` header, the section is omitted ("not available"), never published as zeros. One stderr line names the missing header, never a cell value.
- **Small-cell suppression: none.** Counts are published even when a club has 1 or 2 members with awards. Reasons:
  - TI already publishes the same per-member rows, with names, publicly and without login.
  - The epic's privacy rule bans names and identifiers, not counts.
  - Suppressing counts below 3 would distort small clubs' rankings and protect no one.

## Work breakdown (one issue, 3 PR-sized steps, TDD each)

1. **Collector and contract** (`packages/collector-cli`, `packages/shared-contracts`)
   - Add an optional `educationMembers` section (per-club `{ club, membersWithAward }` only) to `DistrictReportsSectionsSchema`. It's optional, so old files stay valid.
   - The parser computes it from the raw rows.
   - Privacy tests:
     - the `Member` values from the fixture never appear anywhere in the serialized output;
     - the existing `PERSONAL_DENYLIST` test still passes.
   - Security review (`ron-sec`) before merge.
2. **Ranking logic** (`frontend/src/utils/educationAwardRankings.ts`, pure)
   - Inputs: club bases from `analytics.allClubs[].membershipBase`, plus the reports dataset.
   - Outputs: two ranked lists with eligibility, shared ranks, and numerator and denominator.
   - **Crowning Glory** falls back to summing `educationAchievements.achievementCount` when `educationMembers` is absent (older dates).
   - **Team Spirit** shows "not available for this date" when `educationMembers` is absent.
3. **UI** (`DistrictAnalyticsPage`)
   - Return the reports dataset from `useDistrictAnalytics`. It's already fetched there; today it's only used for the renewal overlay.
   - Add an `EducationAwardsLeaderboard` card with the top 10, a "Show all N clubs" control, and provenance ("TI Education Achievements report, as of …").
   - Check at 375, 768 and 1280 px and in dark mode, on the PR preview.

## Prior program year (2025-26)

- **Crowning Glory:** available. The Educational Achievement _Archive_ report (`a30b93f3…`) returns the full 2025-26 ledger (1,246 rows, Jul 2025 – Jun 2026, re-checked live 2026-10-01). It is already backfilled into `snapshots/2026-06-30/` as `educationAchievements`.
- **Team Spirit:** **not available from TI.** The archive's columns are `Club, Division, Area, Award, Date, Name, Location`, and `Name` is the club name (145 distinct values = clubs). There's no member column. The daily report has `Member` but ignores `year` and always returns the current PY. Prior years show "not available" unless the district supplies its own member-level records (a possible one-off import, counts only).
  - **2025-26 (D61):** imported from the operator's year-end CSV export with `import-education-members` (#1603), counts only. See `docs/runbooks/education-members-import.md`.

## Data landing

- The new section starts appearing from the first daily pipeline run after step 1 merges, in staging first and then prod.
- Dates before that get Crowning Glory only.
- **Year-to-date run (approved):** the daily report is a full PY-to-date list, so one `fetch-daily-reports` run after step 1 ships gives complete 2026-27 counts. Run it on staging first, then prod.

## Open check during step 1

- Confirm that TI's report is a full program-year-to-date list on every fetch (the dates seen start 07/01). If so, each day's count is complete without merging across days.
- Confirm what the `Member` column holds (member number or name). The design never stores it either way.
