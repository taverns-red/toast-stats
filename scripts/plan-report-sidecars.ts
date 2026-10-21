/**
 * Plan the report-sidecar manifest (#1767, ADR-015 step 9, D-16).
 *
 * The `promote-reports` job's first step. Writes the sidecar manifest that
 * the content gate (`promotion-content-gate.ts --manifest-only`) reads and
 * the promoter (`promote-run-manifest.ts --execute`) copies, plus the
 * verdict holding every date this run wrote and did not promote. The plan
 * and its design are in ./lib/reportSidecarPlan.ts; the I/O in
 * ./lib/reportSidecarPlanRunner.ts. Writes nothing to any bucket.
 *
 * Env: GCS_BUCKET, GCS_BUCKET_PRODUCTION,
 *      RUN_MANIFEST_FILE (this run's runs/<id>/written.jsonl, local copy),
 *      PROMOTED_DATES (the pipeline's promoted_dates; may be empty),
 *      CARRY_DAYS (default 7: prod's newest indexed dates to carry),
 *      REPORT_SIDECAR_MANIFEST_FILE (default /tmp/report-sidecars/written.jsonl;
 *        not written when the plan is empty),
 *      REPORT_SIDECAR_VERDICT_FILE (default /tmp/report-sidecars/verdict.json),
 *      GCLOUD (default gcloud).
 * Outputs (GITHUB_OUTPUT): objects, carried, held_dates.
 * Exit: 0 planned (possibly nothing) · 1 a bucket read failed · 2 bad input
 *      (no or malformed run manifest, a malformed date list).
 * Logs go to stderr (R4).
 */

import { runPlanReportSidecars } from './lib/reportSidecarPlanRunner.js'

runPlanReportSidecars({
  env: process.env,
  err: s => process.stderr.write(s),
})
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    process.stderr.write(`[report-sidecars] unexpected: ${String(err)}\n`)
    process.exitCode = 2
  })
