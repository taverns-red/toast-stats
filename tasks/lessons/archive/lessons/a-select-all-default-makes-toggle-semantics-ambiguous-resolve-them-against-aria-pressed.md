---
date: 2026-08-01
tier: lesson
summary: When the default selection is "everything", plain-toggle semantics are ambiguous — resolve the first click against what the chip DISPLAYS (aria-pressed), not against the underlying array
tags: [frontend, ux, filters, url-state, accessibility, touch, react]
---

# A select-all default makes toggle semantics ambiguous — resolve them against `aria-pressed`

**Date:** 2026-08-01
**Issue:** #1374 (region filter → OR multi-select)

## What happened

The landing region filter was solo-select (#434): a plain click replaced the
whole selection, and **shift-click was the only additive gesture**. There is no
shift key on a phone, so two regions at once was unreachable on touch — a
functionality gap hiding as a preference. Converting it to a plain multi-select
toggle looks like a two-line change.

It isn't, because the page's default selection is not empty. An inflate-on-load
effect fills `selectedRegions` with **every** region on first data render
(#978 / Lesson 145 — that extra render is also load-bearing for CLS), and the
filter treats both empty and full as "no filtering". So at rest the array
literally contains region 01, and a naive `includes(r) ? remove : add` toggle
makes the very first click **subtract** one region from the full set: tap "01"
and you get *everything except 01*.

That is defensible against the data and indefensible against the screen. The
chips render `aria-pressed={isActive && !isAllActive}` — in the all state every
chip reads **unpressed**, and "All" reads pressed. A control that shows nothing
selected and then removes something on the first tap is lying about its own
state.

## The rule

**When a set-selector has a select-all resting state, branch the first click on
the DISPLAYED state, not the stored one.**

```ts
if (isAllActive) {
  setSelected([region]) // nothing is pressed, so this STARTS a selection
  return
}
const next = selected.includes(region) ? remove(region) : add(region)
setSelected(next.length === 0 ? allRegions : next) // empty ⇒ back to "All"
```

Two invariants fall out and both deserve their own assertion:

- **Deselecting the last chip lands on "All", not an empty result.** Whether it
  writes `[]` or the explicit full set is a URL-shape decision; that it is not
  an empty table is a product decision.
- **Selecting every chip individually must read as "all"** — same rendered
  state, same announcement — or the user reaches a third state the UI has no
  vocabulary for.

## Also worth stealing

- **Rebuild the selection from the canonical ordered list**
  (`all.filter(r => selected.includes(r) || r === clicked)`) rather than
  appending. The URL param then reads `?regions=01,03` no matter which chip was
  tapped first, so two users who made the same selection share the same link.
- **Retiring a modifier gesture is safer than repurposing it.** Shift-click was
  freed up here and the temptation was to make it "solo". Dropping it instead
  means shift-click falls through to the plain handler — which still *adds* a
  region, exactly what the old shift-click did — so muscle memory survives and
  no capability hides behind a key a touch device cannot produce. A gesture
  that only desktop can perform must never be the only route to a capability.
- **Prove modifier-free multi-select with real taps.** `fireEvent.click` in
  jsdom cannot distinguish "works on touch" from "works with a mouse". A
  Playwright context with `hasTouch: true` at 375px and `locator.tap()` can, and
  it measures the 44px floor at the same time.

## Related

- [[a-filter-control-is-aria-pressed-not-role-tab]] — the same "make the ARIA
  and the behaviour agree" move, one level up.
- [[two-url-state-hooks-in-one-handler-lose-a-facet]] — #1362, the Recognition
  row this one was aligned with.
- [[measure-a-multi-sprint-ux-delta-with-a-cors-proxy-and-per-build-served-dirs]]
  — the local CORS-proxy harness the live 375px verification ran on.
