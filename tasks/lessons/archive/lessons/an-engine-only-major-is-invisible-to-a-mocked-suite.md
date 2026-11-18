---
date: 2026-09-09
tier: lesson
summary: An engine-only major is invisible to a mocked suite — guard the runtime floor, prove I/O equivalence against a real bucket
tags: [deps, gcs, storage, verification, node, ci, pipeline, guard]
---

# An engine-only major is invisible to a mocked suite

**Date:** 2026-09-09
**Issue:** #1531 (`@google-cloud/storage` 7.21.0 → 8.0.1; Dependabot re-cut as #1542)
**Tags:** deps, gcs, storage, verification, node, ci, pipeline, guard

## What happened

`@google-cloud/storage` 8.0.0 looked like the scariest kind of bump: the
library writes production data, and the failure modes we feared — different
object headers, a stream that silently short-reads, a listing that returns
fewer objects without erroring (the #1469 shape) — are all invisible to a test
suite that mocks GCS. Dependabot's PR was `CLEAN` with every check green, and
that green was worth nothing as evidence.

The release notes turned out to say one thing only: **`engines.node`
`">=14"` → `">=22"`.** No API change at all. Verifying that claim rather than
trusting it took three cheap, independent probes:

1. **Diff the shipped build, not the changelog.** `npm pack` both versions and
   `diff -r` the `build/` trees. Every delta was additive
   (`ComposeCleanupError`, `deleteSourceObjects`, `signingEndpoint`), a
   fail-fast fix in `createWriteStream`, or richer retry-error message text.
   The transitive majors that looked dangerous were not: `@google-cloud/paginator`
   5→7 dropped `arrify` and adopted class-field syntax; `retry-request` 7→9
   differs by **one trailing comma**. Both are the packages that would carry a
   pagination or retry regression, and neither had one.
2. **Round-trip against a real scratch prefix, both versions, identical input.**
   Two throwaway `node_modules` trees, one script, one bucket prefix. Compare
   `contentType`, `contentEncoding`, `cacheControl`, `size`, `md5Hash`,
   `crc32c` and a sha256 of the downloaded bytes. Identical is a fact; "the
   notes say nothing changed" is not.
3. **Listing on a count you know from a third source.** A short list cannot
   pass silently if the expected number is asserted. Synthesise a prefix with a
   known object/virtual-directory count *and* force multi-page pagination with
   a tiny `maxResults`; then repeat on real prefixes (1500 and 1338 objects,
   well past one page) and compare a sha256 of the full sorted name list
   against an independent `gcloud storage ls` count.

## The transferable takeaway

**When a major's only breaking change is the runtime floor, the regression
guard belongs on the runtime, not on the API.** Assert that `.nvmrc` — the
single source every workflow's `setup-node` reads — satisfies the
`engines.node` range read from the *installed* package, never a hard-coded
number. That guard is falsifiable (drop `.nvmrc` to 20 and it fails with
"expected 20 to be greater than or equal to 22") and it fires on the *next*
engine-only major too, instead of at 03:00 in the data pipeline.

## Corollary — scope the blast radius before fearing it

The CDN `Cache-Control` and `Content-Encoding` on published artifacts are set
by `gsutil/gcloud cp -Z` in `data-pipeline.yml`, **not** by this Node client,
and `ClubTrendsStore` / `TimeSeriesIndexWriter` never import the package at all
— they touch the local filesystem and are synced by that same CLI. Half the
feared surface was not on this bump's path. Grep the actual import sites
before budgeting fear (R6, R8).

## Also worth knowing

v8 emits **two `MaxListenersExceededWarning`s on every `file.download()`**
(11 error + 11 close listeners on a `PassThrough`); v7 emits none.
Deterministic, independent of content-encoding, and bytes are still correct.
It lands on stderr, so R4 holds — stdout stays valid JSON — but it is real log
noise wherever downloads are batched (`readMetadataForDate` reads a 130-date
window, 20 at a time). Upstream noise, not a correctness bug; worth
recognising rather than re-investigating.
