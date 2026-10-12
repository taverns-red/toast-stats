# ADR-007: Serve Data via GCS + Cloud CDN + Load Balancer (not Firebase Hosting)

## Status

Accepted (May 2026). Documents a previously-implicit decision (partly retroactive — see Note).

## Context

[ADR-001](001-cdn-only-frontend.md) removed the Express proxy and established that pre-computed data is served as static JSON from Google Cloud Storage via Cloud CDN at `cdn.taverns.red`. Concretely that data path is: a **regional GCS bucket** (`toast-stats-data-ca`, `northamerica-northeast1` / Montréal) → a **Cloud CDN-enabled backend bucket** → a **global external HTTPS Load Balancer**. The React SPA itself is served separately from **Firebase Hosting** (`ts.taverns.red`).

Firebase Hosting has its own built-in CDN and carries **no Load Balancer forwarding-rule charge**. So a fair question — raised by the 2026-05-30 cost investigation ([`docs/investigations/gcp-network-spend-2026-05-30.md`](../investigations/gcp-network-spend-2026-05-30.md)) — is _why serve the data through a self-managed GCS + Cloud CDN + LB stack instead of Firebase Hosting?_ No prior ADR, issue, or lesson recorded that comparison. This ADR records the rationale.

## Decision

Keep data on a **regional GCS bucket fronted by Cloud CDN via a global external HTTPS Load Balancer**. Do **not** migrate data serving to Firebase Hosting. The frontend SPA stays on Firebase Hosting.

### Rationale

1. **Data residency.** The production data bucket is a regional bucket in `northamerica-northeast1` (Montréal). A regional GCS bucket + Cloud CDN keeps the bytes-at-rest in Canada; Firebase Hosting's origin is Google-managed (US multi-region), which forfeits residency control over Canadian Toastmasters data.
2. **Code/data pipeline decoupling.** The scheduled `data-pipeline` Action writes JSON to GCS independently of frontend deploys — "code and data are separate pipelines; neither triggers the other" (`docs/ci-cd-flow.md`). Serving data from Firebase Hosting would re-couple data publishing to a `firebase deploy`.
3. **API ingress lockdown.** The same LB fronts the `toast-stats-api` Cloud Run service, enabling ingress restricted to `internal-and-cloud-load-balancing` (#156). Firebase Hosting → Cloud Run rewrites cannot enforce that posture.
4. **Object volume.** Districts × daily snapshots × ~10 analytics file types × accumulating history is a large, ever-growing object set — a natural fit for GCS, not for a per-deploy hosting upload.
5. **Cache control + custom domain.** `cdn.taverns.red` with per-prefix `Cache-Control` (immutable snapshots, short-TTL manifests).

## Consequences

### Positive

- Data residency stays in Canada (regional bucket).
- Frontend and data pipelines remain fully decoupled.
- `toast-stats-api` can be locked to LB-only ingress.
- Reads scale globally at CDN edge for pennies of data transfer.

### Negative

- A **fixed Global LB forwarding-rule minimum charge (~$18–24/mo)**, flat for the first 5 forwarding rules regardless of traffic. This was masked by promotional credits through ~April 2026 and is now fully billed — it was the entire "rising network spend" in the 2026-05-30 investigation, not a usage spike. Accepted as the cost of the properties above.
- The project is **shared**: `speech-evaluator` contributes 2 of the 4 global forwarding rules. Splitting products into separate GCP projects would not remove Toast Stats's share of the flat fee while ≥1 global rule remains.

## Note (retroactive)

Reasons 1–5 justify _keeping_ the architecture; they were not all captured in writing when the stack was first built (the original recorded decision, ADR-001/#168/#173, was about deleting the Express proxy for latency). This ADR is therefore partly reconstructed. If Canadian data residency is **not** a hard requirement, a future ADR could supersede this one and move the data CDN to Firebase Hosting to drop the forwarding-rule fee — but that trade was judged not worth pursuing as of 2026-05-30.

## Addendum (2026-10-12, #1852): compression on the wire

Two storage classes reach the browser through `cdn.taverns.red`:

| Prefixes                     | Stored                                             | How the wire bytes get compressed                                 |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `snapshots/`, `time-series/` | gzip (`gcloud storage cp -Z`, adds `no-transform`) | Served pre-encoded, `Content-Encoding: gzip`                      |
| `v1/`, `config/`             | identity                                           | **Cloud CDN dynamic compression** on the backend bucket (br/gzip) |

**Decision.** Compress `v1/` and `config/` at the edge with dynamic compression
(`compression-mode: AUTOMATIC` on backend bucket `toast-stats-cdn-backend`),
not by uploading them with `-Z`. Per the Cloud CDN docs
(docs.cloud.google.com/cdn/docs/dynamic-compression) it is supported on
backend buckets, covers `application/json`, prefers brotli (10–20 % smaller
than gzip), caches the compressed variant, bills egress on compressed bytes,
and skips responses that already carry a `Content-Encoding`, carry
`no-transform`, or are under 1 KiB or over 10 MiB. So the `-Z` prefixes are
untouched, and every `v1/`/`config/` object is in range except
`v1/latest.json` (152 B).

**Why not `-Z`.** The stored bytes of `v1/` and `config/` are read back by
the pipeline itself: `gcloud storage cat` of `v1/latest.json`, `dates.json`
and `rankings.json` in the manifest step and the count and value gates, the
daily download → merge → re-upload of `config/district-snapshot-index.json`,
the content gate's SDK reads, and the staging→prod rsync. Gzip at rest would
make each of those depend on the gcloud/SDK decode behaviour that caused
#1702 (568 kept gzip, 576+ inflates), and GCS's decompressive transcoding
"invalidates integrity checking" (Cloud Storage transcoding docs). Edge
compression changes none of the stored bytes.

**Guard.** `scripts/pipeline/gcs-upload.sh` refuses `-Z`, `--gzip-*`,
`--content-encoding=` and `no-transform` for `v1/` and `config/`
destinations: any of them would silently switch edge compression off for that
object.

**Apply / roll back** (infra, outside the pipeline; Ron runs it):

```bash
gcloud compute backend-buckets update toast-stats-cdn-backend --compression-mode=AUTOMATIC
gcloud compute backend-buckets update toast-stats-cdn-backend --compression-mode=DISABLED   # rollback
```

**Verify:** `npx tsx scripts/cdn-compression-check.ts` (read-only; exit 0 when
every frontend-fetched `v1/`/`config/` object comes back br/gzip and decodes
to one layer of JSON). Cached identity entries age out within their
`max-age` (300–900 s). Staging has no CDN (ADR-002), so preview channels stay
uncompressed for these prefixes.

## Related

- [ADR-001](001-cdn-only-frontend.md) — CDN-only frontend (Express proxy removal)
- Issue #156 — restrict `toast-stats-api` Cloud Run ingress to internal-and-cloud-load-balancing
- Issues #168 / #173 — serve analytics via GCS + Cloud CDN; delete Express backend
- [`docs/investigations/gcp-network-spend-2026-05-30.md`](../investigations/gcp-network-spend-2026-05-30.md) — the cost investigation that prompted this ADR
