---
date: 2026-11-01
tier: lesson
category: lesson
summary: A callback-ref + useNearViewport gate placed in a page re-renders the whole page on mount; keep the gate's state inside the section component
tags: [frontend, react, tests, performance]
---

# Keep a section's viewport-gate state in the section, not the page

**Date:** 2026-11-01
**Issue:** #2430

## What happened

The club page's new Recent changes card fetches snapshots only once it
nears the viewport (`useNearViewport`). The first cut kept the gate in
`ClubDetailPage`: `const [el, setEl] = useState(null)` and
`<div ref={setEl}>`. Mounting sets that state, so the whole page renders a
second time. Five `ClubDetailPage.test.tsx` tests then failed. They set up
`useDistrictAnalytics` with `mockReturnValueOnce`, and the second render
fell back to the default mock, so the panels they asserted on disappeared.

## Takeaway

A gate whose only consumer is one section belongs in a small wrapper
component (`ClubRecentChanges`) that owns the ref state and the gated hook.
The page re-renders only when its own data changes. Tests that pin one
render keep holding, and a real user's page skips a pointless full
re-render.

## Second takeaway (PR #2446 preview smoke)

A gated section that has not started reading is **idle, not loading**.
The first cut reported `isLoading` (and so `aria-busy="true"`) whenever the
feed was null. That included the whole time the card sat off-screen waiting
for the gate. `club-hero-cls.smoke.ts` waits for no `[aria-busy="true"]`
anywhere on the page, so it timed out 12 of 12 times. A reader who never
scrolls down would also have had a page that never settled for assistive
technology. Derive `aria-busy` from in-flight reads only. A skeleton can
still hold the space while the section is idle.
