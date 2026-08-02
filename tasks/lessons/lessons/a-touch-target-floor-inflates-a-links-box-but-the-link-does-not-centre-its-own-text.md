---
date: 2026-08-02
tier: lesson
summary: A touch-target floor inflates a link's box but the link does not centre its own text, so an items-center row mixing links and spans renders on two baselines
tags: [css, accessibility, frontend, layout, flexbox, touch-targets]
---

# A touch-target floor inflates a link's box, but the link does not centre its own text

**Date:** 2026-08-02
**PR:** issue #1387

## What happened

The subpage breadcrumb rendered on two visual baselines: the links sat ~14px
**above** the `›` separators and the current-page crumb.

```
District 61   Clubs
          ›        ›  Saint-Lazare Inspirers
```

Every part was `font-size: 14px`, same family, `vertical-align: baseline`. The
only difference was box height — 48px for the anchors, 21px for the spans:

| element | tag | y | height |
| --- | --- | --- | --- |
| `District 61` | `A` | 80 | **48** |
| `›` | `SPAN` | 94 | 21 |
| `Clubs` | `A` | 80 | **48** |
| current crumb | `SPAN` | 94 | 21 |

Three things had to be true at once, and each is individually reasonable:

1. `styles/layers/base.css` floors `a[href]` at `min-height: 44px` for WCAG
   2.5.5 (`styles/responsive.css` bumps it to 48px from 1024px up).
2. The crumb `<a>` is a **flex item** of its `<li>`. Flex items are
   **blockified** — an `<a>`'s `display: inline` computes to `block`, and
   `min-height` (which does nothing on a non-replaced inline box) suddenly
   *applies*. The 14px link becomes a 48px box.
3. That box does **not** centre its own content. The 20px line box paints at
   the TOP. Meanwhile `align-items: center` on the row centres the floor-free
   21px spans in the same 48px flex line.

So the accessibility floor was met, the flex row was centred, and the text was
still 14px off.

## The lesson

**A min-height floor gives an element a bigger box; it does not tell the
element what to do with the space.** Wherever a floored interactive element
sits in an `align-items: center` row next to non-interactive text, the row
centres the *boxes* and the glyphs disagree. Fix it by making the control
centre its own content — `display: inline-flex; align-items: center` — never
by shrinking the box back down. Shrinking trades a cosmetic bug for a WCAG
violation, and the fix costs nothing: the box is unchanged, so there is no
reflow and no CLS.

This was the **third** surprise from the same 44px floor. The first two were
under-reserves (a skeleton that omits a `<button>` reserves 17px where the
loaded state needs 50px, #1359). The shape to recognise is always the same:
**a small control whose box is silently 44px+.** When you see one in a layout,
ask both questions — how much space does it take, and where inside that space
does its text land?

## Where to look

`button`, `a[href]`, `[role=button]` and `[tabindex]:not([tabindex='-1'])` all
carry the floor from `styles/layers/base.css`. The dangerous context is any of
them as a **flex or grid item** (blockification makes the floor bite) inside a
container with `align-items: center` and non-interactive siblings.

## How to test it

jsdom has no layout engine, so a unit test can only assert the centring
contract is *present*. Prove the pixels in Playwright, and measure the
**rendered text**, not the box — the whole bug is that the two disagree, so a
box-centre assertion passes while it is broken. A `Range` over the element's
contents gives the real inline text box:

```js
const range = document.createRange()
range.selectNodeContents(el)
const centre = range.getBoundingClientRect().top + rect.height / 2
```

Group by flex line before comparing if the row is `flex-wrap` — parts on
different lines are *supposed* to disagree — and assert in the same test that
the 44px floor survived, so the forbidden fix cannot turn the guard green.
