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

---

## `2026-06-30-global-rollup.json` — the same directory, the whole rollup

A **sibling** capture of the same `snapshots/2026-06-30/` directory, read from
`gs://toast-stats-data-ca` on 2026-08-31 for #1498. Sibling rather than an
extension of the file above, because that one is frozen and stays byte-exact.

**Why it exists.** The worldwide scoreboard (`global-totals.json`, epic #1496)
is more than payments, and every one of its numbers has the same
double-counting hazard. This capture pins the whole table on the same hard
date. Live-verified values, all reproduced by
`scripts/lib/__tests__/globalTotals.test.ts`:

| metric                          | value                 |
| ------------------------------- | --------------------- |
| districts in the date's set     | 128 (127 + `U`)       |
| stray PY 2026-27 district files | 30 (excluded)         |
| clubs counted once              | 15,016                |
| membership payments             | **548,483**           |
| Active Members                  | 257,398               |
| paid clubs / active clubs       | 13,708 / 14,282       |
| distinguished or better         | 6,587                 |
| select / president's / Smedley  | 1,037 / 1,289 / 1,912 |
| derived base tier               | 2,349                 |
| distinguished districts         | 42                    |
| new clubs still active          | 913                   |
| suspended clubs                 | 716                   |
| countries / unknown country     | 94 / 6,786            |

548,483 and the four-way tier split are TI CEO Report figures — an external
oracle, not our own output. TI's 932 new clubs, 733 suspensions and 265,512
Mar-31 membership are a DIFFERENT basis and are deliberately not asserted:
the ruling is publish ours, state our basis, never calibrate (#1426).

**Shape.** A country dictionary plus the rankings rows verbatim, so the
distinguished-district calculator can be exercised on real inputs:

```jsonc
{
  "snapshotDate": "2026-06-30",
  "countries": ["United States", "China", ...],
  "rankings": [ /* all-districts-rankings.json rows, verbatim */ ],
  "districts": [
    {
      "districtId": "01",
      // [club id VERBATIM, Total to Date, Active Members,
      //  Charter Date/Suspend Date, index into `countries` (-1 = unmatched)]
      "clubs": [["00000977", 42, 20, "", 0], ...]
    }
  ]
}
```

`Active Members` is joined from `clubPerformance` and the country from
`clubs[].address.country` — three arrays inside one district file, joined on
the canonical club id. Frozen for the same reason as its sibling: do not
regenerate it from the live bucket.
