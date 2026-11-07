/**
 * CDN JSON compatibility guard — runner (#2494, ADR 0019 steps 1 and 3).
 *
 * Thin glue around ./lib/cdnJsonCompat.ts:
 *   1. resolve the latest app release tag on the checked-out history
 *      (`git describe --tags --abbrev=0 --match 'toast-stats-v*'`), or take
 *      COMPAT_BASE_TAG;
 *   2. extract that tag's packages/shared-contracts into .compat-base/ (inside
 *      the repo, so it resolves zod from the root node_modules) and build its
 *      ESM output with its own tsconfig;
 *   3. load the `*ReaderSchema` exports of the release build and of the PR's
 *      build (packages/shared-contracts/dist, built by the workflow first);
 *   4. load the compat fixtures from both trees and compare both ways;
 *   5. on a breaking finding not grandfathered by content hash, verify the
 *      `db-breaking-approved` label through the REST API.
 *
 * Every error is a failure: exit 1. Logs go to stderr (R4); the verdict is
 * also written to $GITHUB_STEP_SUMMARY.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER (for the override),
 *      COMPAT_BASE_TAG (optional), GITHUB_API_URL (optional).
 *
 * Run with tsx: the fixture modules are TypeScript.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  BASE_TAG_MATCH,
  COMPAT_FIXTURES,
  applyGrandfather,
  compareCompat,
  decide,
  fetchOverride,
  loadFixtures,
  markdownCell,
  readerSchemasOf,
  type Finding,
  type GrandfatherEntry,
  type OverrideResult,
} from './lib/cdnJsonCompat.js'

const log = (msg: string) => console.error(msg)

const git = (repo: string, args: string[]): Buffer =>
  execFileSync('git', args, { cwd: repo, maxBuffer: 256 * 1024 * 1024 })

const PER_PAGE = 100
const MAX_PAGES = 30

function restGetAll(token: string, apiUrl: string) {
  return async (path: string): Promise<unknown[]> => {
    const all: unknown[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `${apiUrl}/${path}?per_page=${PER_PAGE}&page=${page}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      )
      if (!res.ok)
        throw new Error(`GET ${path} page ${page}: HTTP ${res.status}`)
      const body: unknown = await res.json()
      if (!Array.isArray(body)) throw new Error(`GET ${path}: not a list`)
      all.push(...body)
      if (body.length < PER_PAGE) return all
    }
    throw new Error(`GET ${path}: more than ${MAX_PAGES} pages`)
  }
}

function readGrandfathered(path: string): GrandfatherEntry[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
    entries?: unknown
  }
  if (!Array.isArray(raw.entries)) throw new Error(`${path}: no entries list`)
  for (const e of raw.entries as Partial<GrandfatherEntry>[]) {
    if (
      typeof e.hash !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(e.hash) ||
      typeof e.reader !== 'string' ||
      (e.direction !== 'backward' && e.direction !== 'forward') ||
      typeof e.reason !== 'string' ||
      e.reason.trim() === ''
    ) {
      throw new Error(`${path}: malformed entry ${JSON.stringify(e)}`)
    }
  }
  return raw.entries as GrandfatherEntry[]
}

const row = (f: Finding) =>
  `| ${f.direction} | ${f.reader} | ${f.kind} | ${markdownCell(f.detail)} | ${f.hash ? `\`${f.hash}\`` : ''} |`

function report(args: {
  tag: string
  readers: number
  breaking: Finding[]
  grandfathered: Finding[]
  override: OverrideResult | null
  verdict: { pass: boolean; reason: string }
}): string {
  const lines = [
    `## CDN JSON compat (#2494): ${args.verdict.pass ? 'pass' : 'FAIL'}`,
    '',
    `Release \`${args.tag}\` vs this PR, ${args.readers} reader schema(s), both directions.`,
    '',
    args.verdict.reason,
  ]
  const table = (title: string, fs: Finding[]) => {
    if (fs.length === 0) return
    lines.push(
      '',
      `### ${title}`,
      '',
      '| direction | reader | kind | detail | hash |',
      '| --- | --- | --- | --- | --- |',
      ...fs.map(row)
    )
  }
  table('Breaking', args.breaking)
  table('Grandfathered by content hash', args.grandfathered)
  if (args.breaking.length > 0 && !args.verdict.pass) {
    lines.push(
      '',
      'A deliberate break needs `db-breaking-approved` applied by rservant. ' +
        'See docs/runbooks/cdn-json-compat.md.'
    )
  }
  return lines.join('\n') + '\n'
}

async function main(): Promise<boolean> {
  const repo = git(process.cwd(), ['rev-parse', '--show-toplevel'])
    .toString()
    .trim()
  const tag =
    process.env['COMPAT_BASE_TAG'] ||
    git(repo, [
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      BASE_TAG_MATCH,
      'HEAD',
    ])
      .toString()
      .trim()
  log(`[cdn-json-compat] release: ${tag}`)

  const work = join(repo, '.compat-base')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    const tar = git(repo, [
      'archive',
      '--format=tar',
      tag,
      'packages/shared-contracts',
    ])
    execFileSync('tar', ['-x', '-C', work], { input: tar })
    const basePkg = join(work, 'packages/shared-contracts')
    log(`[cdn-json-compat] building ${tag} shared-contracts`)
    execFileSync('npx', ['tsc', '-p', join(basePkg, 'tsconfig.esm.json')], {
      cwd: repo,
      stdio: ['ignore', 2, 2],
    })

    const importBuild = async (pkg: string) =>
      (await import(
        pathToFileURL(join(pkg, 'dist/esm/index.js')).href
      )) as Record<string, unknown>
    const baseSchemas = readerSchemasOf(await importBuild(basePkg))
    const headSchemas = readerSchemasOf(
      await importBuild(join(repo, 'packages/shared-contracts'))
    )

    const findings = compareCompat({
      base: {
        schemas: baseSchemas,
        fixtures: await loadFixtures(COMPAT_FIXTURES, work),
      },
      head: {
        schemas: headSchemas,
        fixtures: await loadFixtures(COMPAT_FIXTURES, repo),
      },
    })
    const { breaking, grandfathered } = applyGrandfather(
      findings,
      readGrandfathered(
        join(repo, 'scripts/lib/cdnJsonCompatGrandfathered.json')
      )
    )

    let override: OverrideResult | null = null
    if (breaking.length > 0) {
      const token = process.env['GITHUB_TOKEN']
      const repoName = process.env['GITHUB_REPOSITORY']
      const pr = Number(process.env['PR_NUMBER'])
      override =
        token && repoName && Number.isInteger(pr) && pr > 0
          ? await fetchOverride(
              restGetAll(
                token,
                process.env['GITHUB_API_URL'] || 'https://api.github.com'
              ),
              repoName,
              pr
            )
          : {
              approved: false,
              reason:
                'cannot verify the override: GITHUB_TOKEN, GITHUB_REPOSITORY or PR_NUMBER unset',
            }
    }
    const verdict = decide({ breaking, override })
    const md = report({
      tag,
      readers: new Set([
        ...Object.keys(baseSchemas),
        ...Object.keys(headSchemas),
      ]).size,
      breaking,
      grandfathered,
      override,
      verdict,
    })
    log(md)
    const summary = process.env['GITHUB_STEP_SUMMARY']
    if (summary) appendFileSync(summary, md)
    return verdict.pass
  } finally {
    if (!process.env['COMPAT_KEEP']) {
      rmSync(work, { recursive: true, force: true })
    }
  }
}

main().then(
  pass => process.exit(pass ? 0 : 1),
  err => {
    log(
      `[cdn-json-compat] FAIL (fails closed): ${err instanceof Error ? err.stack : String(err)}`
    )
    const summary = process.env['GITHUB_STEP_SUMMARY']
    if (summary) {
      appendFileSync(
        summary,
        `## CDN JSON compat (#2494): FAIL\n\nThe guard could not run: ${String(err)}\n`
      )
    }
    process.exit(1)
  }
)
