# `2026-06-30-club-payments.json` — the double-counted snapshot, frozen

A byte-frozen reduction of the real `snapshots/2026-06-30/` directory, read
from `gs://toast-stats-data-ca` on 2026-08-31.

**Why it exists.** That directory holds 158 district files: the 128 districts
that existed at the 2025-26 close plus 30 renumbered PY 2026-27 districts a
rewrite stamped onto it (#1465). 4,673 clubs appear under two districts, so a
rollup that trusts the directory listing overcounts — and the CORRECT total has
an externally published expected value, which makes this a free regression case
(#1466):

| scope                                                           | payments    |
| --------------------------------------------------------------- | ----------- |
| The 128 districts `all-districts-rankings.json` lists (correct) | **548,483** |
| Naive sum over all 158 files                                    | 575,954     |

548,483 is the TI CEO Report's published 2025-26 membership-payments figure
(`docs/investigations/1426-ceo-report-data-coverage.md` §2), asserted in the
test via `CEO_REPORT_MEMBERSHIP_PAYMENTS` — the report is the source, not our
own output.

**Frozen on purpose.** #1465 leaves the archived directory as it is, and even
if it is ever corrected this fixture must not move: a guard whose expected
value depends on the archive being mutated is not a guard. Do not regenerate it
from the live bucket.

**Shape.** Reduced to what the rollup reads — nothing else:

```jsonc
{
  "snapshotDate": "2026-06-30",
  "rankingsDistrictIds": ["130", "109", ...],  // from all-districts-rankings.json
  "districts": [
    { "districtId": "01", "clubs": [["00000977", 42], ...] }  // [club id, payments]
  ]
}
```

`clubs` entries are `districtPerformance` rows: the club id **verbatim**
(padding preserved — it is what `normalizeClubId` exists to reconcile) and
`Total to Date`, which reconciles exactly with each district's
`totals.totalPayments`. District order is the directory's own file order, which
is what makes club-id deduplication alone order-dependent — see the test.

Excluded from Prettier (`.prettierignore`): reformatting a frozen capture would
triple its size and obscure any real diff.
