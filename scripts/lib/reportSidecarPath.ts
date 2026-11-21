/**
 * Which snapshot objects are report sidecars: the per-district reports
 * (`district_<id>_reports.json`, #1069) and the date's reports rollup
 * (`reports-rollups.json`, #2012). The daily reports job writes them after
 * the pipeline has promoted the date (see ./reportSidecarPlan.ts).
 *
 * A leaf module with no imports, so the PR Preview fixture recorder can use
 * it without pulling the promotion code into PREVIEW_PATHS
 * (workflowPathFilterContract.test.ts).
 */

/** A sidecar or the reports rollup, directly under its date. */
export const REPORT_SIDECAR =
  /^snapshots\/(\d{4}-\d{2}-\d{2})\/(district_[A-Za-z0-9]+_reports\.json|reports-rollups\.json)$/

export function isReportSidecar(path: string): boolean {
  return REPORT_SIDECAR.test(path)
}
