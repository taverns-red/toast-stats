#!/usr/bin/env tsx
/**
 * Classify a PR's changed files for pr-preview.yml (#2865): writes `preview`
 * (true/false) to $GITHUB_OUTPUT. The path list is in scripts/lib/previewPaths.ts.
 *
 * Same shape as scripts/ci-changes.ts (#2607): the PR file list comes from the
 * REST API with the job's own token, no install needed.
 *
 * R4: logs go to stderr.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GATE_PR_NUMBER, GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs'
import { changedFiles } from './lib/prChangedFiles'
import { needsPreview } from './lib/previewPaths'

async function main(): Promise<void> {
  const out = process.env.GITHUB_OUTPUT
  if (!out) {
    console.error('GITHUB_OUTPUT is not set')
    process.exit(1)
  }
  const files = await changedFiles()
  const preview = needsPreview(files)
  console.error(`${files.length} changed file(s): preview=${preview}`)
  appendFileSync(out, `preview=${preview}\n`)
}

main().catch(err => {
  console.error(`changes errored: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
