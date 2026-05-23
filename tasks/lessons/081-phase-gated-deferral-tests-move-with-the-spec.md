---
name: A "we're deferring this until X" test encodes the OLD contract — when a new spec brings the deferral forward, update the assertion (it's not pinning)
description: #353's redesign-tokens.test.ts asserted JetBrains Mono was
  intentionally NOT preloaded yet ("defers JetBrains Mono font preload
  to #354"). #339 Phase 1's brand-font spec brought that deferral
  forward — Brand v1.0 requires all three brand fonts loaded
  together. The CI failure on the brand PR looked like a regression
  but was actually the right test catching a legitimate contract
  change. Updating the assertion + its comment is the correct fix; it
  is NOT assertion pinning (no bug being masked, the underlying
  requirement genuinely changed). The cure for confusion is in the
  test's *comment*: a deferral test must name what would lift the
  deferral, so the next author knows when to update it.
type: feedback
---

# Lesson 81 — Phase-gated deferral tests move with the spec, they don't get pinned around

**Date:** 2026-05-23
**Issue:** #339 (adopt Red Taverns Brand v1.0 tokens — Phase 1)

## What happened

Sprint 19 shipped Phase 1 of #339 — copy-on-release of the upstream
brand `tokens.css`, import from `index.css`, preload Space Grotesk +
Inter + JetBrains Mono. Local TDD passed (6/6 contract tests, 1
known property-test flake unrelated). Pre-commit, build, deploy
preview, Quality Gates, Lighthouse, Security Scan — all green.

CI's **Test Suite** then failed on a single pre-existing test in
`frontend/src/__tests__/css-migration/redesign-tokens.test.ts`:

```ts
it('declares the --mono token but defers JetBrains Mono font preload to #354', () => {
  ...
  expect(html).not.toMatch(/family=JetBrains\+Mono/)
})
```

That test was filed under #353 (redesign tokens) and locked in a
deliberate cost optimization: the `--mono` token referenced
JetBrains Mono so callers could use it, but the _preload_ was held
back until AppShell (#354) shipped a real consumer — saving ~25KB +
one stylesheet RTT on every cold load until then.

The contract changed under #339. Brand v1.0 Phase 1 lists JetBrains
Mono in the **brand-font set** (Space Grotesk + Inter + JetBrains
Mono) that must be loaded together as the brand identity, regardless
of whether any component currently consumes it. The deferral was
brought forward by ~1 sprint to honor the brand spec.

## Why this isn't assertion pinning

Looking at the test failure, the **wrong** reflex is:

> "CI failed on a test I didn't touch — quick, comment out the
> assertion or flip the expectation."

That would be assertion pinning under R1 (CLAUDE.md) and the
manifesto's "No Shortcuts" rule. Assertion pinning means:
**adjusting a test expectation to match a bug**, hiding the bug
behind a green CI signal.

Here the test was correct _for the contract it was written under
(#353)_. A newer, higher-authority contract (#339 Phase 1 brand
spec) explicitly supersedes the deferral. The right action is:

1. **Update the assertion to match the new contract** —
   `expect(html).toMatch(/family=JetBrains\+Mono/)`
2. **Update the test's comment** to point at the new contract — name
   #339 + the brand block in CLAUDE.md.
3. **Commit it with `test(...)` prefix**, not `fix(...)` — this is a
   contract update, not a regression fix.
4. **Reference the new issue in the commit message** so future
   archaeology finds the supersession.

## How to apply

**Rule:** A test that begins with "defers X to #N" or "X is
intentionally NOT done yet" encodes a phase-gated state. When the
phase ends — usually because a higher-authority spec lands — the
test moves with it. Updating the assertion is correct; pinning
around it (skip / `not.toMatch` flipped to `toMatch` with no
comment update) is not.

**Why:** Phase-gated assertions are load-bearing in two directions:
they catch _both_ (a) someone accidentally adding the deferred thing
early, and (b) someone shipping the deferred thing without
remembering to update the test. The "+" path (b) is the harder one
to see — CI failure looks identical to a regression. The signal that
distinguishes them is the **commit/PR that broke the test**: if it
intentionally shipped the deferred thing as part of a named spec,
the test is doing its job (informing the author the contract
boundary moved), not catching a bug.

**How to apply:**

1. When updating a phase-gated assertion, name **both** sides in the
   new comment: the original deferral reason (cost / blocker) and
   the new spec that lifted it. Two-issue cross-link.
2. Bump the test name to reflect the current behavior. `defers X`
   → `preloads X (#339 brand-font set)`. Future greppers find it.
3. If the test was filed without naming what would lift it
   ("preload is intentionally not added"), retroactively add the
   lifting condition before you update. It will fail this way again.

## Telltale signs you're looking at this, not at a regression

- The failing test's name or comment contains words like "defers,"
  "not yet," "until," "intentionally," "blocked on."
- The failing assertion is `.not.toMatch` / `.not.toContain` rather
  than `.toMatch` / `.toContain`. Negative assertions are how
  deferrals are usually written.
- The PR that broke the test is implementing a spec that's newer
  than the test's named gate (`#339` vs. `#354` here).
- No business-logic data is affected — only configuration / asset
  loading / chrome state.

## What we explicitly did NOT do

- Did **not** revert the JetBrains Mono preload to keep the existing
  test green. The #339 spec is explicit about the brand-font set
  being a unit. Keeping the deferral would have meant shipping #339
  Phase 1 with a partial font set — a category violation.
- Did **not** delete the redesign-tokens test. It still catches the
  forward direction (something is wrong with Montserrat / Source
  Sans 3 weights, or the `--mono` token gets renamed).
- Did **not** comment out the failing assertion or wrap it in
  `it.skip`. That would be R1 ("never bypass failing tests").

## Related

- `frontend/src/__tests__/css-migration/redesign-tokens.test.ts:164`
  — the updated test ("preloads JetBrains Mono (#339 Phase 1 brand-
  font set)").
- `frontend/src/styles/tokens/rt-brand-v1.css` — the new brand
  tokens file that triggered the supersession.
- `CLAUDE.md` § "Brand (Red Taverns v1.0)" — the documented
  rationale for loading all three brand fonts together.
- Lesson 78 — sibling pattern about distinguishing a real
  regression from a stale-symptom test. Same discipline applied at
  the assertion level: read the comment before you flip the bit.
