---
id: '167'
category: lesson
tags: [frontend, react, router, cls, verification, playwright, mobile]
auto_load: true
date: 2026-06-13
issues: [1103, 1191]
---

# Lesson 167 — Client-side scroll restoration has three independent cross-engine traps; only live both-engine testing separates them

**Date:** 2026-06-13
**Issue:** #1103 (epic #1191 Sprint 4 — add ScrollRestoration)
**PR:** #1203

## What happened

`createBrowserRouter` no longer auto-resets scroll, and `AppShell` rendered
`<Outlet/>` with no restoration, so deep-scrolled landing → district clicks
rendered the detail page scrolled past its header (audit H4). The "obvious"
one-line fix — mount RR's `<ScrollRestoration/>` — passed PUSH→top but Back
restored to ~250px, not the saved offset. Fixing it surfaced **three separate
failure modes**, each invisible to unit tests and each only distinguishable by
driving the _live, deployed_ page in _both_ Playwright engines:

1. **Async, data-driven height clamp.** The landing leaderboard renders short on
   its first POP commit (the region filter inflates to the full row set via a
   post-mount effect that is load-bearing for CLS — Lesson 145). RR restores
   _once_, synchronously, at the commit, so a single `scrollTo` clamps to the
   short height and never re-applies. → re-assert the target across `rAF` frames
   until it holds for a few consecutive frames or a budget elapses.

2. **`html { scroll-behavior: smooth }` makes `scrollTo(x, y)` _animate_.** The
   two-arg form (and `scrollIntoView()`) honor the CSS, so restoration _crawled_
   toward the offset (0 → 21 → 143 → … over >1.5 s) and the frame budget expired
   mid-animation, landing the page partway up. → restore with
   `scrollTo({ top, behavior: 'instant' })` / `scrollIntoView({ behavior:
'instant' })`, which overrides the CSS and jumps. (Verified live:
   `instant` scrollTo(5000) lands at 5000 and holds; the (x,y) form does not.)

3. **WebKit clamps `window.scrollY` to 0 on the new DOM before any
   navigation-time read.** Saving the offset in a layout-effect _cleanup_ (the
   moment you leave a page) persisted **0** on Safari — by the time cleanup runs,
   WebKit has already clamped scroll to the new short route — so Back landed at
   the top. Flaky 2/3 on WebKit, green on Chromium. → record the offset
   **continuously** via a scroll listener keyed by an `activeKey` ref, advanced
   _after_ each navigation's scroll decision so the browser's post-nav reset
   events record under the new key and never clobber the page being left.

A fourth, smaller trap: the landing page does **REPLACE** navigations (the
`?regions=…` URL normalization). Treating REPLACE like PUSH (scroll to top)
would yank the user to the top on every filter change → REPLACE must be a no-op.

## The transferable principle

**SPA scroll restoration on a data router is not one fix but a stack of
browser-timing fixes — async content height, CSS smooth-scroll, and WebKit's
pre-navigation scroll clamp each defeat a naive implementation independently,
and none of them reproduce in jsdom. Verify on the deployed preview in BOTH
Chromium and WebKit, reading actual `window.scrollY` over time; a green unit
test and a green Chromium run together still hid a 2/3 Safari failure.**

## How to apply

- Restoration scrolls must use `behavior: 'instant'` whenever the app sets
  `scroll-behavior: smooth` anywhere on `html`/`body`.
- Never read `window.scrollY` at navigation/cleanup time to persist a position —
  WebKit has already reset it. Record continuously while the user is on the page.
- Re-assert a restore across `rAF` frames (don't trust a single `scrollTo`) when
  the destination's height is data-driven; stop on a few stable frames.
- Distinguish PUSH (→ top) from REPLACE (→ preserve) from POP (→ restore);
  REPLACE is a same-page URL update.
- The hook needs only `useLocation`/`useNavigationType` — no data-router
  dependency — so it unit-tests under any router and the `<MemoryRouter>`-based
  component tests don't need rewiring.
- Iterate cross-engine flakes against a **local** `vite preview` built with
  `VITE_CDN_BASE_URL=…toast-stats-data-staging` (the staging bucket serves
  `access-control-allow-origin: *`; the prod `cdn.taverns.red` does not), which
  reproduces the WebKit clamp without a ~10-min push+deploy cycle.

## Related

- [[145-an-incidental-extra-render-can-be-load-bearing-for-cls-removing-it-regresses-layout]]
  — the region-inflate re-render this restore had to survive (short-first commit).
- [[139-an-anchor-jump-from-a-scroll-locked-sheet-has-three-scroll-clobbering-traps]]
  — same shape: only live measurement separates independent scroll-clobbering
  traps.
- [[133-measure-a-multi-sprint-ux-delta-with-a-cors-proxy-and-per-build-served-dirs]]
  — the local-build-against-staging-CDN verification pattern.
