---
id: '159'
category: lesson
tags: [verification, playwright, cdn, data-pipeline, automation, frontend]
auto_load: true
date: 2026-06-10
issues: [1135, 1101]
---

# Lesson 159 — Live-verify a pipeline-gated CDN artifact by injecting the REAL locally-built artifact via route interception (and drive the missing-artifact path un-injected)

**Date:** 2026-06-10
**Issue:** #1135 (epic #1101 Sprint 2 — omni-search divisions/areas)
**PR:** #1158

## What happened

Sprint 2's UI reads `config/divisions-areas-index.json`, which Sprint 1
(#1134) only publishes via the scheduled daily pipeline (08:00 UTC). At
verification time the artifact 404'd on both staging and prod CDNs, and
manually seeding the staging bucket was classifier-blocked (correctly: a
shared pipeline-owned file that every PR preview reads).

The standing convention says "code-proof accepted" here — but a stronger
verification was available without touching shared state: run the Sprint-1
builder locally against the synced staging snapshots (the exact inputs the
pipeline will use), then drive the deployed PR preview with Playwright,
fulfilling only that one route from the local file:

```ts
await page.route('**/config/divisions-areas-index.json', route =>
  route.fulfill({ path: DA_INDEX_PATH, contentType: 'application/json' })
)
```

Everything else — bundle, rankings, club index — is the genuinely deployed
surface. And because the artifact is really absent, the same smoke ran a
**second, un-injected test** asserting the fail-soft path live: bare "61"
still finds District 61 against the real 404, with no Divisions group.

Two operational potholes en route: `gsutil -m cp` of the 128 snapshots hung
at 0 B indefinitely (sandboxed AND unsandboxed) — plain parallel `curl`
against `storage.googleapis.com` finished in seconds, but needs
`--compressed` or GCS's gzip transcoding leaves raw gzip bytes on disk that
parse as "corrupt".

## The transferable principle

**When a feature's data dependency only materializes via a scheduled
pipeline you must not (or cannot) trigger, the live drive doesn't have to
collapse to code-proof: build the artifact with the shipped builder from
the real upstream inputs and inject exactly that one response via
`page.route` against the deployed preview — then verify the
artifact-absent path with no injection, because right now is the one time
it is genuinely absent in production-like conditions.** State the injection
explicitly in the evidence so the operator knows which byte-path was
simulated and which was real.

## How to apply

- The injected file must come from the same builder + same live inputs the
  pipeline uses (here: `scripts/build-divisions-areas-index.ts` over the
  staging `snapshots/<latest>/district_*.json`) — not a hand-written
  fixture, or you've verified the fixture (cf.
  [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]]).
- Treat a blocked seed of shared pipeline-owned state as a design signal,
  not an obstacle: interception scopes the substitution to your own test
  session.
- A missing-artifact window is a free chaos test — drive the degraded path
  before the pipeline closes it.
- Prefer `curl --compressed` loops over `gsutil -m` for bulk GCS reads on
  the runner host; verify payloads parse before blaming the data.

## Related

- [[152-a-live-result-locator-must-key-on-the-stable-route-not-the-cdn-derived-label]] —
  the locator discipline this sprint's smoke reused.
- [[154-synthetic-fixtures-validate-the-code-only-a-captured-real-pair-validates-the-policy]] —
  the fixture-fidelity principle this extends to live drives.
