---
date: 2026-09-13
tier: lesson
summary: An accessible name concatenates adjacent elements with no separator — a count badge inside a disclosure button reads "…Plan1" until a literal whitespace text node sits between the spans
tags: [a11y, aria, disclosure, react, css, testing, action-list]
---

# A count badge inside a control needs a separator text node

**Date:** 2026-09-13
**Issue:** #1569 (collapsible Area Director Actions sections)

## What happened

The four action sections became disclosures, and the count badge moved
*inside* the header `<button>` on purpose: the operator decision was that
all four totals stay visible when a section is collapsed, and putting the
badge in the control means a screen-reader user hears the total without
expanding. Three spans, no text between them:

```tsx
<span className="…__chevron" aria-hidden="true" />
<span className="…__heading-text">{heading}</span>
<span className="…__count">{count}</span>
```

The rendered page looks right — flexbox `gap: 0.6rem` puts real space
between them. The accessible name does not:

```
Clubs without a Club Success Plan1
```

Accessible-name computation walks the subtree and concatenates each node's
contribution. CSS `gap`, `margin`, and the newlines JSX strips are not
text, so nothing separates "Plan" from "1". The fix is one character —
`{' '}` between the spans — and it is free visually, because CSS flexbox
does not render a whitespace-only text run as a flex item.

## The transferable takeaway

**When chrome inside a control carries information (a count, a badge, a
status dot), assert the ACCESSIBLE NAME, not the text content.** The two
agree everywhere except exactly where element boundaries stand in for word
boundaries — which is precisely where you put the badge.

`toHaveTextContent` would have passed here: `textContent` on the button is
also `"Clubs without a Club Success Plan1"`, and a substring match on the
heading succeeds regardless. Only `toHaveAccessibleName` compares the whole
computed string, and only because the assertion was written as a regex over
the *full* name did the missing space show up as a failure rather than a
shrug.

The same shape is waiting in any header that composes a label with a
trailing numeric pill, a "NEW" flag, or a unit — and in the reverse
direction too: a decorative element that is NOT `aria-hidden` silently
joins the name.

## What to do

- Put a literal `{' '}` (or a real space inside one of the spans) between
  adjacent inline elements whose text must be read as separate words.
- Keep decorative chrome `aria-hidden="true"` so it contributes nothing.
- In the test, assert the full accessible name with a regex that spans both
  halves (`/Heading\s+1/`), not a substring of one of them.
- An axe scan will not catch this: the name is non-empty, so every
  structural rule passes. It is a *correctness* bug in the name, not a
  violation.
