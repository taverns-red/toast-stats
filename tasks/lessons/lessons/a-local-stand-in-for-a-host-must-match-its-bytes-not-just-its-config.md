---
date: 2026-11-08
tier: lesson
category: lesson
summary: Serving a build "like Hosting" from the Firebase emulator reproduces firebase.json but not Hosting's brotli level (q4 vs q11, ~18% more script bytes) and not WebKit's handling of upgrade-insecure-requests on http loopback; measure the stand-in's bytes against the real host before trusting byte budgets
tags: [ci, firebase, hosting, lighthouse, playwright, webkit, compression, csp, testing]
---

# A local stand-in for a host must match its bytes, not just its config

**Date:** 2026-11-08
**Issue:** #2544

## What happened

PR Preview's Playwright shards and Lighthouse mobile gate moved off the
deployed `pr-<N>` channel onto the same build served inside the runner. The
Firebase Hosting emulator on firebase.json's `staging` target gave the same
headers, rewrites and clean URLs, and Chromium smokes passed at once. Two
differences only showed up when measured:

1. **Compression level.** The emulator brotli-encodes at quality ~4. Hosting
   uses quality 11: a 191,751-byte chunk came back 44,748 bytes from
   ts.taverns.red; quality 11 gives 44,746, quality 4 gives 52,724. The
   Lighthouse mobile gate asserts transfer sizes, so the emulator alone
   would have pushed /district/61/clubs (252 KB of script) past its 300 KB
   budget for a reason no user ever sees.
2. **`upgrade-insecure-requests` on http loopback.** Chromium treats
   127.0.0.1 as trustworthy and upgrades nothing. WebKit upgrades every
   same-origin request to https://127.0.0.1, where nothing listens: every
   WebKit test failed with "A TLS error caused the secure connection to
   fail".

A third assumption, written into three CLS gate tests ("loopback is not
throttled"), was false: CDP `Network.emulateNetworkConditions` slowed a
200 KB fetch to 5.0 s on 127.0.0.1, localhost and a LAN address alike.

## Takeaway

When a test moves from a real host to a local stand-in, compare the bytes
and the per-engine behaviour, not just the config both read. Fetch one
asset from the real host and the stand-in with the same Accept-Encoding and
compare sizes, and run one spec in every engine before the whole suite. A
byte budget measured on the stand-in is only the same gate if the bytes are
the same.
