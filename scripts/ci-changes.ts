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

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return v
}

async function changedFiles(): Promise<string[]> {
  const token = requireEnv('GITHUB_TOKEN')
  const repo = requireEnv('GITHUB_REPOSITORY')
  const pr = requireEnv('GATE_PR_NUMBER')
  const files: string[] = []
  for (let page = 1; ; page++) {
    let body: { filename: string }[] | undefined
    for (let attempt = 1; attempt <= 3 && !body; attempt++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
          },
        }
      )
      if (res.ok) body = (await res.json()) as { filename: string }[]
      else if (res.status >= 500 && attempt < 3)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      else throw new Error(`GET pulls/${pr}/files -> ${res.status}`)
    }
    files.push(...body!.map(f => f.filename))
    if (body!.length < 100) return files
  }
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
