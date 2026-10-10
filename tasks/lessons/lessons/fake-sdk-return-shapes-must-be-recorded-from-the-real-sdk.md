---
date: 2026-10-10
tier: lesson
summary: Test fixtures and fakes for an external SDK or CLI must be recorded from the real system (same call, same options, same version), never hand-written from assumptions, or the tests prove the plan instead of reality
tags: [testing, mocks, fixtures, gcs, google-cloud-storage, gcloud, cli-migration, data-pipeline, promotion-gate]
---

# Lesson — Fake SDK return shapes must be recorded from the real SDK

**Date:** 2026-10-10
**Issues:** #1715 (pre-promotion content gate), #1726 (promotion-held alert),
#1702 (gzip store corruption)

## What happened

The content gate listed objects with `bucket.getFiles({ prefix, fields })`
and read `f.metadata.size`. Its decision logic was well tested, but the
listing was never exercised against anything resembling the SDK. In
`@google-cloud/storage` 8.2.0, `getFiles` with `fields` set returns the raw
JSON-API items as plain objects (`{ name, size, md5Hash, crc32c,
contentEncoding? }`). It does not return `File` instances, so there is no
`.metadata`. The first real daily run (38039833417) crashed and held
promotion. This is the same class as #1702: the tests proved the plan, not
reality.

## Takeaway

An option can change the SDK's return type. Here, `fields` switches the
result from `File` to a plain object. Before writing a fake for an SDK call:

1. Run the exact call, with the same options, read-only, and record the
   JSON of what comes back (`fixtures/gcs-get-files/with-fields.json`).
2. Read the SDK branch that builds the result (`bucket.js`:
   `if (query.fields) return file`).
3. Assert that the fake's output matches the recorded fixture key for key,
   so the fake cannot drift from reality.
4. Run the real entry point once against real (read-only) infrastructure
   before declaring it done. Here,
   `npx tsx scripts/promotion-content-gate.ts --self-check`.

## The same class, three times in one week

Each failure below had green tests or green verification. In each case the
evidence came from an assumed shape of an external system, not one observed
from it.

| Case | Assumed | Real | Cost |
| --- | --- | --- | --- |
| Content gate (#1726, fixed in #1727) | `getFiles` returns `File` objects with `.metadata` | With `fields`, `@google-cloud/storage` 8.2.0 returns plain `{name, size: string, md5Hash, crc32c}` | Daily run 38039833417 crashed and held promotion |
| CLI swap (#1412, caused #1702) | Matching `rsync` dry-run op lists mean the tools behave alike | A dry run transfers no bytes; the tools decoded gzip differently | Store gained ~10 gzip layers; trends froze |
| gcloud version (#1702, D2 probe run 37992637048) | The runner uses a current gcloud | `setup-gcloud` `latest` resolved to 568, which keeps stored gzip; 576+ decompresses | Local reasoning (588) did not match CI (568); fixed by pinning in #1721 |

## General rule (SDKs and CLIs alike)

- **Record, don't write.** A fixture for an external SDK response, CLI
  output or file format comes from a read-only run of the real thing, with
  the exact options. Commit it with a note on how it was captured.
- **Record against the version that runs in CI.** Log the version where it
  runs (`gcloud version`, the SDK's `package.json`) and pin it. A fixture
  recorded on a laptop with a different version is still an assumption.
- **Options and versions are part of the shape.** `fields` changed the
  return type; 568 vs 588 changed the bytes on disk. Re-record when either
  changes.
- **Plans are not outputs.** A dry run, op list or count is not a recording
  of what the system produces. See
  `a-store-round-tripped-through-gzip-encoding-needs-a-download-normaliser-and-an-upload-guard.md`
  for the byte-level checks.
