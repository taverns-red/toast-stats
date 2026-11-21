/**
 * Which changed files need a PR Preview (#2865).
 *
 * pr-preview.yml used to carry this list as `on.pull_request.paths`, so a PR
 * touching none of them never got a `PR Preview verdict` check and the check
 * could not be required. The trigger has no filter now; the `changes` job
 * (scripts/preview-changes.ts) applies this list instead, and the verdict
 * passes as "not needed" when nothing matches. Same pattern as
 * scripts/lib/ciGateNeeds.ts for ci.yml (#2859).
 *
 * The list is moved from the workflow unchanged, in its original order and
 * spelling. Tests that used to read `paths:` from the YAML read this constant
 * instead (workflowPathFilterContract, lighthouseConfigPathFilter,
 * prPreviewFixtures).
 *
 * No imports: the `changes` job runs this with the standalone tsx and no
 * `npm ci`, so it cannot depend on picomatch.
 */
export const PREVIEW_PATHS = [
  'frontend/**',
  'packages/shared-contracts/**',
  'packages/analytics-core/**',
  'firebase.json',
  '.firebaserc',
  '.github/workflows/pr-preview.yml',
  'scripts/check-hosting-site.sh',
  'lighthouserc.mobile.js', // the mobile gate below runs it (#1994)
  '.nvmrc', // setup-node reads it (#2005)
  'tools/firebase-tools/**', // the pinned Firebase CLI it installs (#2551)
  // the catch-all smoke step runs them (#2141)
  'scripts/unlisted-smoke-specs.ts',
  'scripts/lib/smokeSpecCoverage.ts',
  // the shards and Lighthouse serve the build with them (#2544)
  'scripts/serve-preview-locally.sh',
  'scripts/preview-local-server.mjs',
  'scripts/check-deployed-files.mjs',
  // the fixtures the shards read instead of live cdn-staging (#2545)
  'scripts/refresh-smoke-fixtures.ts',
  'scripts/lib/smokeFixtures.ts',
  'scripts/lib/cdnSchemaCanary.ts', // its schema pass reuses these
  'scripts/lib/zodIssueSummary.ts',
  'scripts/lib/reportSidecarPath.ts',
  'scripts/smoke-fixtures.manifest.json',
] as const

/**
 * True if one repo-relative path matches a {@link PREVIEW_PATHS} entry. The
 * entries use only two forms, so this is not a general glob engine: `dir/**`
 * (anything under `dir/`) and an exact path. A drift test compares it with
 * picomatch (GitHub's own filter semantics) over every entry.
 */
export function isPreviewPath(file: string): boolean {
  return PREVIEW_PATHS.some(glob =>
    glob.endsWith('/**') ? file.startsWith(glob.slice(0, -2)) : file === glob
  )
}

/**
 * The pulls/{n}/files API returns at most 3000 files. A list that long may be
 * truncated, so a preview path could be past the cut: run the preview (#2865 F4).
 */
export const PR_FILES_API_CAP = 3000

/**
 * True if ANY changed file is a preview path, the same ANY semantics as a
 * GitHub `paths` filter. An empty list returns true: an ambiguous diff must
 * not be a free pass, so it runs the preview (the safe default, as in
 * classifyChanges for ci.yml).
 */
export function needsPreview(files: string[]): boolean {
  return (
    files.length === 0 ||
    files.length >= PR_FILES_API_CAP ||
    files.some(isPreviewPath)
  )
}
