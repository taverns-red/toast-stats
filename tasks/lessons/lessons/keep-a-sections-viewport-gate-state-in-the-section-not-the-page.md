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
