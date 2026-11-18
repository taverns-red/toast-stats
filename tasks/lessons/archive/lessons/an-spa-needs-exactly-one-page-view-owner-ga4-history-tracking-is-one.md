---
date: 2026-10-12
tier: lesson
summary: GA4 Enhanced Measurement sends a page_view on every pushState/replaceState even with send_page_view:false — an SPA must pick ONE page_view owner, and a manual router hook stacked on gtag double- or quadruple-counts
tags: [analytics, ga4, gtag, spa, router, frontend, smoke, verification]
---

# An SPA needs exactly one page_view owner — GA4 history tracking is one

**Date:** 2026-10-12
**Issue:** #1946 · **Related:** #314 (the hook), #1906 (deferred gtag loader)

## What happened

Prod sent 4 GA `page_view`s per load of `/`, 3 on `/district/61`, 2 on a club
page and 2 per SPA navigation. Three senders were stacked:

1. `gtag('config')` sends a page_view by default.
2. A `useLocation` hook sent a manual page_view per `pathname + search`
   change, which includes the landing's URL-state `replaceState`s. Behind the
   deferred loader these all queued in `dataLayer` and flushed as one batch.
3. The property's Enhanced Measurement setting "page changes based on browser
   history events" sent its own page_view on every history change.

Google's docs say (3) fires *even with `send_page_view: false`*. A canary that
patched the config confirmed it. So "disable auto, send manually" is not
enforceable from code. It also needs a GA admin toggle.

## Takeaway

Before adding a page_view call, find out who already sends page_views:
config, Enhanced Measurement or the app. Keep exactly one owner. Here that was
gtag: config counts the load and Enhanced Measurement counts navigations.

To tell the senders apart, intercept `g/collect` and read the hits:
- Enhanced Measurement hits carry `ae`.
- Manual hits that pass `page_path` carry `dp`.

To verify GA without sending real hits, serve the preview *as* the prod
hostname with `page.route`, then fulfill every collect request locally with a
204 (`e2e/ga-page-view.smoke.ts`).
