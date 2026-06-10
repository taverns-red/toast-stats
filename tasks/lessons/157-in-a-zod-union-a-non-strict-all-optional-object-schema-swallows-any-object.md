---
id: '157'
category: lesson
tags: [zod, schemas, data-pipeline, monorepo, verification, contracts]
auto_load: true
date: 2026-06-10
issues: [1123, 1096]
---

# Lesson 157 — In a zod union, a non-strict all-optional object schema matches (and silently EMPTIES) any object; strictness is what keeps the union falsifiable

**Date:** 2026-06-10
**Issue:** #1123 (epic #1096 Sprint 1 — ScrapedRecordSchema matches FAC-enriched reality)
**PR:** _(record on merge)_

## What happened

Extending `ScrapedRecordSchema`'s value union to accept the FAC enrichment
objects looked one-line-simple:

```ts
z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  CoordinatesSchema, // { lat: number, lng: number }
  AddressSchema,
]) // { street?, city?, region?, postalCode?, country? } — ALL optional
```

Two traps, both silent under zod's default strip mode:

1. **An all-optional non-strict object schema accepts ANY object.** Every
   key is optional and unknown keys are stripped, so `AddressSchema`
   happily parses `{ anything: 'at all' }` → `{}`. With it in the union,
   "reject arbitrary objects" — the property that makes the contract
   falsifiable — quietly becomes "accept and EMPTY arbitrary objects".
2. **Union order is a data-loss hazard under strip mode.** zod returns the
   first branch that succeeds. A non-strict `AddressSchema` placed before
   `CoordinatesSchema` would match a `{lat, lng}` object (unknown keys →
   stripped) and return `{}` — validation "passes" while the parsed output
   (which validating readers like the mcp-server serve onward) lost the
   coordinates entirely.

The fix that keeps the contract meaningful: `z.strictObject` for both
enrichment shapes (an object only counts as an address when it is _exactly_
address-shaped), and `coordinates` ordered before the all-optional
`address`. The pre-existing "rejects arbitrary object values" test only
still passes because of that strictness.

## The transferable principle

**When you add an object branch to a zod union, default-strip mode turns
shape mismatch into silent data mutation instead of failure: an
all-optional branch is a universal matcher, and an early loose branch can
"win" and strip a later branch's required fields. Use `strictObject` for
union branches (especially all-optional ones) and treat branch order as
load-bearing — then pin both with a test that an arbitrary object still
fails and a parsed enriched value round-trips verbatim.** The cost of
strictness — adding a field to the shape now requires a same-PR schema
update — is the point: the alternative is exactly the silent contract
drift the schema exists to prevent.

## How to apply

- Audit unions for branches where every key is optional; under strip mode
  each one is `z.any()` for objects, just lossier.
- After parsing through a union, assert round-trip fidelity
  (`parsed.x === input.x`) in at least one test — `success: true` alone
  can't see stripping.
- Order union branches most-constrained → least-constrained.

## Related

- [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]] —
  this sprint's fixture half: the recorded live payload is what made the
  drift (and this trap) visible at all.
- [[156-a-rekeyed-conversion-field-must-match-the-target-keys-domain-not-just-its-shape]] —
  same epic, same family: type-compatibility making the wrong thing look right.
