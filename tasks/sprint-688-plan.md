# Sprint 5 / #688 — three Distinguished-remaining columns (absolute, not %)

Epic #683 F4 (headline). Frontend-only. Depends on #686 (Sprint 3) analytics fields.

## Decisions

### PM — remove vs keep the % columns (open decision #5)

**REPLACE.** Amy explicitly wants the count, "NOT the percentage." Lesson 092:
find what already ships the feature and replace it; don't bolt a second one on.
The 3 percentage prerequisite columns (Payment Growth, Distinguished %, Club
Growth %) map 1:1 to the 3 absolute fields and are swapped in place. Officer-award
booleans (Education/Training, CGD) and Tier are untouched.

### Architecture — data source (lesson 103: derive from the same gate)

- Canonical: `DistinguishedDistrictStatus.{paymentsRemaining,paidClubsRemaining,
distinguishedClubsRemaining}` (#686), present once the pipeline regenerates.
- Today's prod snapshot (2026-05-23) predates the pipeline run, so those fields
  are absent — but `nextTierGap` (with `paidClubBase`/`paymentBase` + clamped
  gap %) IS present. Frontend fallback derives the count from the gate's own
  clamped gap output:
  - paymentsRemaining = ceil(paymentGrowthGap/100 × paymentBase)
  - paidClubsRemaining = ceil(clubGrowthGap/100 × paidClubBase)
  - distinguishedClubsRemaining = ceil(distinguishedPercentGap/100 × paidClubBase)
- **Proof of zero drift:** ceil(gap%/100 × base) = ceil(base×(1+min/100) − current)
  = ceil(base×(1+min/100)) − current (current is an integer) = canonical field.
  Exact, not approximate. The gap is the gate's own output ⇒ lesson 103 satisfied,
  no formula/threshold duplication on the frontend.
- nextTierGap is to the tier ABOVE current. For NotDistinguished it IS Distinguished
  (verified D47). For already-Distinguished+ districts the minimum is met ⇒ ✓ (0).

### Render rule (AC #2)

- canonical field present → ✓ if 0, else the count
- field absent, tier ≥ Distinguished → ✓ (minimum cleared)
- field absent, NotDistinguished + nextTierGap → derived count (✓ if 0)
- otherwise (no awards / no gap) → em-dash
  Count renders plain (e.g. `277`), no `+` prefix — a "remaining" countdown is a
  clamped non-negative count, not a signed delta (lesson 102 family).

## Plan (TDD)

1. RED: rewrite `distinguishedCountdown.test.ts` for the new field names +
   absolute-remaining semantics + derivation fallback + D47=277 anchor.
2. GREEN: `distinguishedCountdown.ts` — fields renamed, source from canonical
   then gap-derived fallback.
3. RED: RegionPage tests — three "Remaining to Distinguished" columns
   (Paid Clubs / Payments / Distinguished Clubs), ✓/count/—.
4. GREEN: RegionPage header (colgroup) + DistinguishedCells + renderer.
5. /simplify, fresh-context /review, axe.
6. Verify: full suite; live smoke on ts.taverns.red; doc product-spec.

## Verification note

AC "D47 payments reads 277 on today's snapshot": with the gap-derived fallback
this renders 277 LIVE today (no pipeline wait). Confirmed prod D47 nextTierGap:
paymentGrowthGap=4.1, paymentBase=6738 → ceil(4.1/100×6738)=ceil(276.3)=277. ✓
