#!/usr/bin/env tsx
/**
 * Classify a PR's changed files for ci.yml (#2607 item 3): writes `code` and
 * `docs` to $GITHUB_OUTPUT. Decision logic is in scripts/lib/ciGateNeeds.ts.
 *
 * On a non-PR event (push to main, workflow_call) the workflow's own
 * `paths-ignore` already decided to run, so `code=true docs=false`.
 *
 * R4: logs go to stderr.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GATE_PR_NUMBER,
 * GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs'
import { classifyChanges } from './lib/ciGateNeeds'
import { changedFiles } from './lib/prChangedFiles'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return v
}

async function main(): Promise<void> {
  let result = { code: true, docs: false }
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const files = await changedFiles()
    result = classifyChanges(files)
    console.error(
      `${files.length} changed file(s): code=${result.code} docs=${result.docs}`
    )
  }
  appendFileSync(
    requireEnv('GITHUB_OUTPUT'),
    `code=${result.code}\ndocs=${result.docs}\n`
  )
}

main().catch(err => {
  console.error(`changes errored: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
