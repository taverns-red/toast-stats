---
date: 2026-08-02
tier: lesson
summary: Removing a disallowed ARIA attribute can un-mask a second violation the bad attribute was exempting — re-run the scanner after the fix, never just before it
tags: [accessibility, axe, aria, testing, frontend, combobox]
---

# Removing a bad ARIA attribute can un-mask the violation it was exempting

**Date:** 2026-08-02
**Issue:** #1360 (landing page Lighthouse a11y 0.87)

## What happened

axe reported exactly one critical on the landing page's hero search input:

```
aria-allowed-attr — ARIA attribute is not allowed: aria-expanded="false"
```

The fix looked like a one-line deletion. It was — and deleting it turned a
one-violation page into a two-violation page:

```
aria-valid-attr-value — Invalid ARIA attribute value:
aria-controls="district-search-suggestions"
```

The suggestions listbox only mounts while the input is focused *and* has
matches, so `aria-controls` had been pointing at an absent id the whole time.
axe never reported it, because it **exempts an unresolved `aria-controls`
target when `aria-expanded="false"` says the popup is collapsed** — a
deliberate, reasonable carve-out. The invalid attribute was the exemption for
the dangling one. Removing it withdrew the exemption.

## The transferable part

**A scanner's violation list is a function of the current markup, including
the broken parts.** Rules carve out exemptions conditioned on other
attributes, so a defect can be *load-bearing* for a clean report. The count
before the fix does not bound the count after it, and "fixed the one thing
axe named" is not the same as "axe is clean."

Practically: re-run the scanner **after** each fix, not once at the start to
build a worklist. A worklist built from a single pre-fix scan is a lower
bound.

The same shape shows up outside a11y — a suppressed lint rule that keeps a
second rule from firing, a failing test that short-circuits before reaching a
second assertion, a type error that masks the ten downstream ones behind it.

## The fix that stuck

Gate the attribute on the thing it references actually existing, from the same
predicate that renders it:

```tsx
const suggestionsOpen = searchFocused && searchSuggestions.length > 0
…
aria-controls={suggestionsOpen ? 'district-search-suggestions' : undefined}
…
{suggestionsOpen && <ul id="district-search-suggestions" role="listbox">…</ul>}
```

One predicate, so a dangling reference is unrepresentable rather than merely
absent today. `AppShell/HeaderSearch.tsx` already had this form.

## The other half: don't buy the role to keep the attribute

The tempting alternative was `role="combobox"`, which *does* permit
`aria-expanded`. It would have been a lie. The ARIA combobox contract is
keyboard-owned — Down/Up move a virtual focus via `aria-activedescendant`,
Enter selects, Escape dismisses, and the options stay out of the tab order.
This input has no `onKeyDown` at all and its "options" are `<Link>` anchors
the user tabs to.

**Adding a role to legalise an attribute is backwards.** The role describes
behaviour that exists; it does not summon it. A widget that announces itself
as a combobox and then ignores every arrow key is worse for a screen-reader
user than one that never made the claim — the attribute was cosmetic, the
promise is not.

## Related

- `frontend/src/pages/DistrictsPage.tsx` — the gated attribute
- `frontend/src/components/AppShell/HeaderSearch.tsx` — the honest combobox,
  with the keyboard model that earns the role
- `frontend/src/__tests__/accessibility/DistrictsPage.loaded.axe.test.tsx`
