---
date: 2026-06-27
tier: incident
summary: A Node security patch (not firebase-tools) broke all firebase deploys via keep-alive
tags: [ci, deploy, firebase, node, auth, wif]
legacy_id: "173"
---

# A Node security patch (not firebase-tools) broke all firebase deploys via keep-alive

**Symptom (2026-06-27):** every firebase deploy (preview + prod) failed with
`Error: Failed to authenticate, have you run firebase login?`, despite a healthy WIF
setup. `gcloud auth print-access-token` minted a token from the _same_ credential in the
_same_ job, so the WIF→service-account binding was fine.

**Root cause:** **Node.js bug [nodejs/node#63989](https://github.com/nodejs/node/issues/63989).**
The 2026-06-17 coordinated **security release** (CVE-2026-48931, commit `179ddaedfb` —
a `freeSocketDataGuard` listener on idle agent sockets) broke `node-fetch@2`'s keep-alive
socket reuse, throwing `ERR_STREAM_PREMATURE_CLOSE` on HTTPS calls to `*.googleapis.com`
token endpoints. It shipped in **Node v22.23.0**, v24.17.0, v26.3.1 simultaneously.
firebase-tools (Node, via gaxios→node-fetch) hits it on the token exchange; `gcloud`
(Python) is immune. **Fixed in Node v22.23.1** (commit `eaa292549e`). Reported on the
firebase side as firebase-tools #10716 / #10726.

**Why it was a trap:**

- It looked like a **firebase-tools version regression** (the issue was first filed as
  "15.22.2 broke it"). It is NOT — pinning firebase-tools to the last-green 15.22.0 fails
  identically. The CLI version was correlation; **prove the pin before shipping it.**
- `.nvmrc` was the major-only `22`, and `setup-node` runs `check-latest: false`, so CI
  ran the runner's **cached 22.23.0** (buggy) even though the fixed 22.23.1 was already
  published. A major-only Node pin silently floats onto a bad patch.

**Fix applied:** pin `.nvmrc` to the exact fixed patch **`22.23.1`**. That restored WIF,
so the temporary `FIREBASE_TOKEN` workaround (added when an org policy blocked an SA-key
fallback) was reverted — back to keyless WIF.

**Transferable rule:** when a Node-based CLI suddenly fails on network/auth across all of
its own versions while a non-Node tool (gcloud) works on the same credential, suspect the
**Node runtime**, not the CLI. Pin Node to an exact patch in CI, and don't trust a
major-only `.nvmrc` to avoid a bad same-day security patch.
