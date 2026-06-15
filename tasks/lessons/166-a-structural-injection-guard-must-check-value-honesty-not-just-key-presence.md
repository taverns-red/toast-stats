---
id: '166'
category: lesson
tags: [collector-cli, monorepo, verification, tdd, data-pipeline, process]
auto_load: true
date: 2026-06-13
issues: [1160, 1129, 1098]
---

# Lesson 166 — A structural injection guard must check value-honesty, not just key-presence (and a factory beats type-required when fixtures block it)

**Date:** 2026-06-13
**Issue:** #1160 (epic #1193 Sprint 2 — #1129 review follow-ups)
**PR:** _(record on merge)_

## What happened

#1129 left two follow-ups: BackfillOrchestrator hardcoded
`isClosingPeriod: false` (a second laundered-default twin-writer, Lesson 158
— fixed here by omitting the key), and `TransformService`'s
`closingDateRegistry` injection was enforced only by a doc-comment ("every
production site MUST inject this"). The obvious structural fix — make the
config field `required` — was blocked: ~32 TransformService and 11
RebuildService **test fixtures** legitimately construct without a registry to
exercise the legacy fail-open path. Making it required would ripple a 43-site
edit into test code and destroy the deliberate "fixtures opt into fail-open"
affordance.

The shipped enforcement was a pair: a **production factory**
(`createProductionTransformService`, which loads and injects the registry —
the blessed direct-construction path, zero fixture blast radius) plus a
**source-scanning guard test** that flags any production `new TransformService(`
omitting the registry (the backstop covering RebuildService's internal
construction and any future site).

Two review catches sharpened it:

- The first guard checked only that the **key name** `closingDateRegistry`
  appeared in the constructor argument — so `closingDateRegistry: undefined`
  (fail-open in disguise) would have passed. A present key is necessary but
  not sufficient; the guard now also rejects an explicit `: undefined`.
- The guard's comment-stripper doc-comment overclaimed "string literals are
  left intact." It is a regex heuristic, not a lexer (you cannot handle both
  `//`-inside-a-string and apostrophe-inside-a-comment with naive regex). The
  honest fix was to state the limitation, not pretend robustness (Lesson 84).

## The transferable principle

**When you turn a "callers must inject X" contract into a structural one,
enforce the VALUE, not just the syntactic presence of the key — a guard that
checks `closingDateRegistry` appears will wave through
`closingDateRegistry: undefined`, which is the exact fail-open it exists to
catch. And when type-level `required` enforcement is blocked because legacy
fail-open test fixtures deliberately omit the field, the proportionate
structural pair is a blessed factory (loads the real value, so the right path
can't forget it) plus a zero-fixture-cost source-scan guard (the regression
backstop for bypasses). A source-scan guard is a regex heuristic, not a lexer
— document precisely what can fool it rather than claiming completeness.**

## How to apply

- Guard a "must be injected" contract on value-honesty: reject key-absent AND
  `key: undefined` (and `?? undefined`-style launderers if in scope). Presence
  of the identifier is not proof a real value flows.
- Type-`required` is the strongest enforcement, but count the fixtures first:
  if N legitimate fail-open fixtures omit the field, a factory + guard avoids
  the N-site churn while still closing the "forgot to inject" hole.
- The factory loads the real dependency so the blessed path is correct by
  construction; the guard catches bypasses. They reinforce — neither alone is
  complete (a factory can be bypassed; a key-presence guard passes `undefined`).
- A regex source-scan stripper cannot be a lexer. State its blind spots in the
  doc-comment (Lesson 84) instead of overclaiming.

## Related

- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — the #1129 parent; this is its named #1160 follow-up (the BackfillOrchestrator twin-writer + the injection contract).
- [[061-fix-the-formula-everywhere-not-just-the-one-in-the-bug-report]] — audit every writer, not just the reported one.
- Lesson 82 (sentinel catches a known-bad snippet) and Lesson 84 (a doc
  example of a parsed format is valid input) — both shaped the guard's tests.
- `packages/collector-cli/src/services/transformServiceFactory.ts`,
  `transformServiceRegistryGuard.ts`, `BackfillOrchestrator.ts`.
