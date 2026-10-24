/**
 * Plan the report-sidecar manifest (#1767, ADR-015 step 9, D-16).
 *
 * The `promote-reports` job's first step. Writes the sidecar manifest that
 * the content gate (`promotion-content-gate.ts --manifest-only`) reads and
 * the promoter (`promote-run-manifest.ts --execute`) copies, plus the
 * verdict holding every date this run wrote and did not promote. It also
 * plans the education rollup into its own manifest and verdict (#2222),
 * held unless its reports date is one prod indexes
 * (./lib/educationRollupPlan.ts), first and isolated: a rollup fault is
 * education_rollup=error and a warning, never a failed plan. The
 * plan and its design are in ./lib/reportSidecarPlan.ts; the I/O in
 * ./lib/reportSidecarPlanRunner.ts. Writes nothing to any bucket.
 *
 * Env: GCS_BUCKET, GCS_BUCKET_PRODUCTION,
 *      RUN_MANIFEST_FILE (this run's runs/<id>/written.jsonl, local copy),
 *      PROMOTED_DATES (the pipeline's promoted_dates; may be empty),
 *      CARRY_DAYS (default 7: prod's newest indexed dates to carry),
 *      REPORT_SIDECAR_MANIFEST_FILE (default /tmp/report-sidecars/written.jsonl;
 *        not written when the plan is empty),
 *      REPORT_SIDECAR_VERDICT_FILE (default /tmp/report-sidecars/verdict.json),
 *      EDUCATION_ROLLUP_MANIFEST_FILE (default /tmp/education-rollup/written.jsonl)
 *        and EDUCATION_ROLLUP_VERDICT_FILE (default
 *        /tmp/education-rollup/verdict.json): written only when it promotes,
 *      GCLOUD (default gcloud).
 * Outputs (GITHUB_OUTPUT): objects, carried, held_dates, rollup_objects,
 *      education_rollup (none | held | current | promote | error).
 * Exit: 0 planned (possibly nothing) · 1 a bucket read for the sidecars
 *      failed (the rollup, planned first, stands) · 2 bad input
 *      (no or malformed run manifest, a malformed date list).
 *
 * `--apply-content-gate` (#2227), the step after the content gate: drop
 * every date with a sidecar that failed the gate (CONTENT_GATE_FILE, default
 * /tmp/report-sidecars/content-gate.json) from the manifest and add it to
 * the verdict, so the other dates still promote. Outputs: objects,
 * content_promote, content_held_dates, held_dates. Exit 2 when there is no
 * planned manifest or verdict.
 *
 * `--apply-rollup-hold` (#2222 M2), after that: drop the education rollup's
 * manifest when the sidecar verdict holds its reports date (asOf), or when
 * it cannot tell (no verdict, the content gate not applied). Outputs:
 * rollup_objects, education_rollup. Exit 0.
 *
 * Logs go to stderr (R4).
 */

import {
  runApplyEducationRollupHold,
  runApplySidecarContentGate,
  runPlanReportSidecars,
} from './lib/reportSidecarPlanRunner.js'

const io = { env: process.env, err: (s: string) => process.stderr.write(s) }
;(process.argv.includes('--apply-content-gate')
  ? runApplySidecarContentGate(io)
  : process.argv.includes('--apply-rollup-hold')
    ? runApplyEducationRollupHold(io)
    : runPlanReportSidecars(io)
)
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    process.stderr.write(`[report-sidecars] unexpected: ${String(err)}\n`)
    process.exitCode = 2
  })
