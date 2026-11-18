---
date: 2026-06-13
tier: lesson
summary: Sibling docs rot at different rates; a doc-accuracy pass must re-verify each file against the live system, never assume a shared baseline
tags: [process, documentation, verification, automation]
legacy_id: "169"
---

# Lesson 169 — Sibling docs rot at different rates; a doc-accuracy pass must re-verify each file against the live system, never assume a shared baseline

**Date:** 2026-06-13
**Issue:** #1108 (epic #1194 Sprint 1 — staging-era docs rewrite)
**PR:** _(record on merge)_

## What happened

A "fix the stale docs" sprint named eight files that all supposedly lagged
"~2 generations behind the code." The tempting move is to derive one
corrected baseline and apply it everywhere. That would have been wrong:
the docs were at **different** truth-generations.

- `README.md` still described a **deleted Express backend**, `dev:backend`
  scripts, Cloud Run + Firestore, React 18, and Axios.
- `docs/architecture.md` had **already** moved past the backend (its first
  line said "no backend server") — but still claimed GitHub Pages/Vercel
  hosting (actual: Firebase) and a 13:00 UTC cron (actual: 08:00 + 11:00).
- `docs/toastmasters-rules-reference.md` **contradicted itself**: §6/§7/§9
  carried the v1.3 #799 correction (club-base denominator) while §11/§12/§15
  still stated the pre-#799 "paid units only" model.

Every correction had to be sourced from the **live system**, not from a
sibling doc: cron + bucket names + promotion gates from
`data-pipeline.yml`, workspace list from `package.json`, route count from
`App.tsx` (`grep -c 'lazy('` → 18, not the documented 3), the club-visit
claim falsified by the `Nov Visit award` CSV column the rules-reference
already documented.

## The transferable principle

**Documentation rots per-file at the rate each file is touched, so a
multi-doc accuracy sweep has no single "current baseline" to copy — every
claim must be re-verified against the authoritative live artifact (workflow
YAML, manifest, router, schema), and sibling docs are as likely to be stale
as the one you're fixing.** The failure mode is "harmonize the docs with
each other" (which launders one doc's error into the others) instead of
"reconcile each doc with the system." A doc can even contradict _itself_
when a correction lands in one section but not the cross-referencing ones —
grep the whole file for the old claim's _shape_, not just the section the
ticket named (cf. R8, L119).

## How to apply

- For each documented fact, name its source of truth and read it: cron/bucket
  → the workflow; scripts/workspaces → `package.json`; routes → the router;
  field availability → the actual CSV/schema. Never cite a sibling doc as
  the authority.
- When a ticket says "§X is wrong," grep the file for every restatement of
  that claim (`paid units`, denominator, the deleted service name). The
  contradiction usually hides in a "Final Rules"/"Implementation"/summary
  block that duplicates the corrected section.
- A pure-docs PR touching no `frontend/**` / `packages/**` triggers **no PR
  preview** (path-filtered) — there is no live surface to drive; verify by
  the doc-vs-system reconciliation itself plus `format:check` + `lint:yaml`,
  and say so in the evidence comment (#138 generalized to docs).

## Related

- [[119-an-issues-cited-doc-may-be-uncommitted-in-the-operators-main-checkout-not-missing]]
  — the other half: verify the doc's _existence/location_ against the live
  checkout, not the issue's assumption.
- `R8` (audit the full read+write path of what you change), `R7` (inventory
  what already exists before assuming a gap).
