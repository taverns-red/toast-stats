---
date: 2026-11-08
tier: lesson
category: lesson
summary: A Playwright context route is skipped by `route.continue()` and `route.fetch()` in a page route, so a fixture or stub at context level is bypassed by specs that delay or rewrite the same file; hand off with `route.fallback()` and read the stub for a rewrite
tags: [testing, playwright, fixtures, ci, cost]
---

# A Playwright context route is skipped by `route.continue()` and `route.fetch()`

**Date:** 2026-11-08
**Issue:** #2545 (PR Preview shards read run-scoped CDN fixtures)

## What happened

The CDN fixture is a context route that answers cdn-staging from recorded files and, by design, never forwards. A first run of every smoke on it still reached the live CDN in about twenty tests. Those specs add their own `page.route` for a file the fixture also serves, to delay it (`route.continue()` after a wait) or rewrite it (`route.fetch()`, edit, `route.fulfill()`). A page route wins over a context route, and `continue()` and `fetch()` both go to the network: `continue()` skips the remaining routes, and `fetch()` never goes through routing at all.

A second find from the same run: a fulfilled response carrying `cache-control: no-store` never fired `requestfinished` in Chromium, so a page that read a stubbed 404 never reached `networkidle` and the test timed out at 60 s.

## The takeaway

When you stub at context level to cut network cost or add determinism, a spec-level route that continues or fetches defeats it silently. `route.fallback()` hands the request to the next route (the stub). A spec that rewrites a response needs the stub's bytes, not `route.fetch()`; give specs one helper for that (`fixtureFetch`) and a lint that fails a new bare `route.continue()` or `route.fetch()`. Make the stub assert it: a response that has a server address came off the network, so it can fail the test instead of showing up on the bill. Do not send `no-store` on a fulfilled response.
