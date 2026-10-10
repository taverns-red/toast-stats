---
date: 2026-10-10
tier: lesson
summary: A test double for a third-party SDK call must be pinned to a shape recorded from the real call with the same options, or the tests prove the plan instead of reality
tags: [testing, mocks, gcs, google-cloud-storage, data-pipeline, promotion-gate]
---

# Lesson — Fake SDK return shapes must be recorded from the real SDK

**Date:** 2026-10-10
**Issues:** #1715 (pre-promotion content gate), #1726 (promotion-held alert)

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
