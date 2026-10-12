---
date: 2026-10-12
tier: lesson
summary: A byte-range-served object must not be compressed or transcoded anywhere on its path; a single-range Range header needs no CORS change
tags: [gcs, cdn, cors, range-requests, compression, pmtiles, verification]
---

# A range-served object must carry no Content-Encoding, and Range needs no CORS change

**Date:** 2026-10-12
**Issue:** #1786 (self-hosted Protomaps basemap, ADR-016)

## What happened

The basemap is one 3.8 GB PMTiles file that the browser reads in byte ranges.
Two layers on our data path can each silently turn "give me 16 KB" into "here
are 3.8 GB":

- **GCS decompressive transcoding.** An object uploaded with `-Z` /
  `--gzip-local` (`Content-Encoding: gzip`) is transcoded for clients that do
  not send `Accept-Encoding: gzip`, and then GCS "silently ignores" `Range`
  and serves (and bills) the whole object.
- **Cloud CDN dynamic compression** (our backend bucket is `AUTOMATIC`). A
  compressed response gets `Accept-Ranges: none` and its cache hits ignore
  `Range`. It applies only to listed content types (`application/octet-stream`
  is not one), never to `Cache-Control: no-transform`, and never above 10 MiB.

Nothing fails loudly in either case. The map still renders; it just downloads
the planet.

The opposite instinct, "range requests need a bucket CORS change", was wrong.
A single-range `Range` header is a CORS-safelisted request header. Measured in
Chromium and WebKit on 2026-10-12, a cross-origin `fetch` with
`Range: bytes=0-99` against our unchanged bucket CORS returned `206` with a
readable `ETag`, and no preflight was sent.

## The transferable lesson

For any object read by byte range, check every hop for something that rewrites
the bytes. The fix is metadata, not config:

- upload with `Content-Type: application/octet-stream`;
- add `Cache-Control: …, no-transform`;
- no `Content-Encoding` (the format compresses internally);
- no parallel composite upload (the CDN wants a strong validator).

Before proposing a CORS change for ranges, measure a ranged cross-origin fetch
from the real app origins in both engines. It is usually unnecessary.

## How to apply

- Verify with `curl -D - -H 'Range: bytes=0-16383' -H 'Accept-Encoding: gzip, br'`.
  Expect a 206, a matching `content-range` and `content-length: 16384`, and no
  `content-encoding`. Run it twice and look for `age:` on the second response.
- `gcloud storage objects describe … --format="yaml(content_encoding,component_count,cache_control)"`
  must show no encoding and no component count.
- Related: [gzip round-trip under gcloud 588](a-store-round-tripped-through-gzip-encoding-needs-a-download-normaliser-and-an-upload-guard.md).
