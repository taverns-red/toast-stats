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
import { needsPreview } from './lib/previewPaths'

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
  const files = await changedFiles()
  const preview = needsPreview(files)
  console.error(`${files.length} changed file(s): preview=${preview}`)
  appendFileSync(requireEnv('GITHUB_OUTPUT'), `preview=${preview}\n`)
}

main().catch(err => {
  console.error(`changes errored: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
