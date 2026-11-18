---
date: 2026-08-01
tier: lesson
summary: A web-font swap reflow masquerades as a reserve error — pin both states instead of racing them, and ablate the font before attributing CLS to your diff
tags: [cls, performance, fonts, debugging, skeleton, frontend]
---

# A font-swap reflow masquerades as a reserve error

**Date:** 2026-08-01
**Issues:** #1362 (Recognition filters), #1359 gap (c)

## What happened

A new toolbar row took landing CLS from 0.0116 → 0.0454 at 1350px and 0.0029 →
0.1529 at 375px. The per-entry `sources` looked like a textbook reserve bug,
and they pointed in **opposite directions**:

```
375px   <DIV.districts-hero-stack>  y 483 -> 464   (shell 19px TOO TALL)
1350px  <DIV.districts-hero-stack>  y 282 -> 301   (shell 19px TOO SHORT)
```

An over-reserve at one width and an under-reserve at another, from one static
row, is not a thing a wrap-count error can do. That contradiction was the clue,
and chasing the ±19px would have been wasted work: the row's reserve was
already exact at all four widths.

## Two probes that both lie, in opposite ways

Diffing "the loading shell" against "the loaded page" needs both states pinned.
Racing them fails twice over:

| how you grab the shell | what goes wrong |
| --- | --- |
| snapshot the instant the skeleton appears | web fonts have not swapped, so every paragraph is measured with fallback metrics and **every** text block reads as mis-reserved |
| snapshot after `document.fonts.ready` | on Fast-3G the data has already landed — "before" IS "after" and **every** delta reads as zero, including real ones |

The second one is the dangerous one: it produces a clean all-zeros table that
looks like proof the reserve is perfect.

**Pin the states, don't race them.** Stall the data request in one page
(`page.route(url, () => {})` — never fulfil, so the query never settles and the
shell cannot go away), let a second page load normally, and wait for
`fonts.ready` in both. Any delta is then structural, by construction.

## The ablation that ended the argument

Even with the structural delta at zero, the CLS number barely moved. One run
with the font host blocked settled it:

```
width   fonts-on   fonts-blocked
1350    0.04541    0.01385
 900    0.08278    0.00028
 600    0.03557    0
 375    0.14087    0
```

88–100% of the number was the Google-Fonts `display=swap` reflow of the page
header — pre-existing, page-wide, and present on the base branch at the same
magnitude. Measured head-to-head on one machine, the base branch was *worse*
at three of four widths.

## The lesson

- **Before attributing a CLS delta to your diff, ablate the page-wide
  variables.** A `display=swap` webfont reflows every text block on the page;
  it is a multiplier on whatever else is in the viewport, so *any* change that
  makes the page taller above the fold inflates it without being its cause.
- **A layout-shift `source` whose `node` prints as `undefined` is a detached
  node.** The API kept the rects and lost the element, so it can tell you
  something moved but not what. Reach for a per-element rect diff of two
  pinned states, not the attribution list.
- **Opposite-signed errors from one static element are a contradiction, not
  two bugs.** Treat that shape as evidence the measurement is contaminated.
- **Cross-environment CLS numbers are not comparable.** The same commit
  measured 0.147 against local fixtures, 0.153 on a preview channel and 0.253
  on prod. Only a same-harness, same-moment A/B means anything.

## The structural fix that did work

A wrapping chip row's height depends on a chip count the loading shell cannot
know, so its reserve can only ever be a guess. Making the row a **single
horizontally-scrolling line below 768px** makes its height one chip tall at any
count — the reserve becomes exact by construction rather than by estimation.
That took the fonts-blocked score at 375px and 600px to a literal 0.

The general move: when a reserve cannot be computed, change the layout so the
thing being reserved stops depending on unknown data.

## Related

- [[a-skeleton-that-omits-a-button-under-reserves-by-the-touch-target-floor]] —
  reserve from the cascade, not the visual
- [[bisecting-a-gate-with-no-headroom-finds-variance-not-a-regression]] — the
  same family: a threshold gate whose signal is not a function of the commit
- `frontend/src/__tests__/landingHeaderReserve.guard.test.ts` — the CSS
  contract behind the single-line rows
