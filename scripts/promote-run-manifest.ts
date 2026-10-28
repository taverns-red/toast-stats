/**
 * Scoped promotion — Runner (#1763, ADR-015 P6, migration step 5).
 *
 * Copies the objects this run wrote (the run manifest, #1762) from staging
 * to production, for the dates the completeness gate passed. The plan and
 * every design decision live in ./lib/manifestPromotion.ts; this file is the
 * I/O around it.
 *
 *   --dry-run   print the plan, one line per manifest object, to stdout
 *               (`copy\t<phase>\t<src>\t<dst>`, `hold\t…`, `skip\t…`) and a
 *               summary; reads buckets, writes NOTHING.
 *   --execute   the same plan, then `gcloud storage cp <srcs…> gs://prod/<dir>/`
 *               per destination directory: server-side rewrites, so the bytes
 *               and headers (Content-Encoding, Cache-Control) arrive as staged.
 *               Dates, then globals, then the v1/ entry points; a failed copy
 *               stops the run before the next phase and exits 1.
 *   --og-cards  also copy `og/v1/district/<id>.png`, in its own phase: the
 *               og-cards job's own manifest and verdict only (#2304).
 *   --assume-pass  (dry run only) preview without a completeness verdict,
 *               e.g. against a published runs/<id>/written.jsonl.
 *
 * Reads (both modes, only when the run wrote globals and no date is held):
 * staging v1/dates.json + v1/latest.json (`storage cat`) and prod's date
 * directories (`storage ls gs://prod/snapshots/`).
 *
 * Prune reconcile (#1767, ADR-015 step 9): with PROD_DELETES_FILE (one
 * `raw-csv/<date>` or `snapshots/<date>` prefix per line, the plan from
 * scripts/prune-prod-reconcile.ts), --execute then runs
 * `gcloud storage rm -r gs://prod/<prefix>/` per prefix, after the entry
 * points, and only when the regenerated index promoted. The dry run lists
 * them as `delete\t<gs://prod/prefix/>`. Held deletes exit 1; a failed
 * delete warns (the next prune's plan sweeps it).
 *
 * Gap-district removals (#2232): for each promoted date whose globals
 * land, the #1671 gap districts staging's metadata.json records lose, in
 * prod, the transform objects staging no longer holds (district_<id>.json,
 * analytics/district_<id>_*; never the reports sidecar), and only while
 * prod's district file is the 0-club junk (scripts/lib/gapRemoval.ts).
 * Derived from state, so every path converges. --execute removes them
 * after the entry points; the dry run lists `remove\t<gs://prod/object>`.
 * A failed read or removal exits 1.
 *
 * Env: GCS_BUCKET, GCS_BUCKET_PRODUCTION, RUN_MANIFEST_FILE,
 *      COMPLETENESS_GATE_FILE (default /tmp/completeness-gate.json),
 *      PROD_DELETES_FILE (optional, prune reconcile only),
 *      GCLOUD (default gcloud), PROMOTE_CONCURRENCY (default 4).
 * Outputs (GITHUB_OUTPUT): objects_planned, promoted_dates, held_dates,
 *      globals_promoted, globals_reason (why they held; empty when they
 *      promoted), removals_planned; with --execute also objects_copied,
 *      objects_removed and complete
 *      ('true' only when every promotable object of the run was copied,
 *      and every planned delete ran); with PROD_DELETES_FILE also
 *      prefixes_planned and, on --execute, prefixes_deleted.
 * Exit: 0 — plan printed / copies done (holds are not errors: the
 *      promotion-held flow reports them); 1 — a copy failed, or a prune
 *      reconcile's deletes were held; 2 — bad input (no manifest, malformed
 *      manifest or delete manifest, no verdict for --execute).
 * Logs go to stderr (R4). The work is in ./lib/promoteRunManifestRunner.ts.
 */

import { runPromoteRunManifest } from './lib/promoteRunManifestRunner.js'

runPromoteRunManifest(process.argv.slice(2), {
  env: process.env,
  out: s => process.stdout.write(s),
  err: s => process.stderr.write(s),
})
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    process.stderr.write(`[promote] unexpected: ${String(err)}\n`)
    process.exitCode = 2
  })
