#!/usr/bin/env node
/**
 * check-deployed-files.mjs — every file of the build is on the deployed
 * channel, as itself (#2544).
 *
 * PR Preview's smoke shards test the build served inside the runner, so only
 * the real-preview job looks at the deployed channel. Its staging.smoke.ts
 * loads a few routes, so a font, a basemap glyph or a lazy chunk missing
 * from the deploy would pass it, and Hosting's SPA rewrite answers a missing
 * file with index.html (200, text/html). This HEADs every file in DIST_DIR
 * (the same build the channel got) on BASE_URL and requires 200, with an HTML
 * type for pages only. cleanUrls: `x.html` is checked at `/x`, `index.html`
 * at its directory. Dotfiles are skipped: firebase.json ignores `**\/.*`.
 * HEAD sends no bodies, so the check costs headers, not bytes.
 *
 * Env:
 *   BASE_URL     The deployed origin (required).
 *   DIST_DIR     The build. Default frontend/dist.
 *   CONCURRENCY  Parallel requests. Default 16.
 * Logs to stderr; exits 1 listing every bad file.
 */
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '')
const DIST = process.env.DIST_DIR || 'frontend/dist'
const CONCURRENCY = Number(process.env.CONCURRENCY || 16)

if (!BASE) {
  console.error('::error::BASE_URL is required')
  process.exit(2)
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.')) return []
    const p = join(dir, e.name)
    return e.isDirectory() ? files(p) : [p]
  })
}

/** The URL path Hosting serves a built file at. */
function urlPath(rel) {
  const parts = rel.split(sep)
  const last = parts.at(-1)
  if (last === 'index.html') parts[parts.length - 1] = ''
  else if (last.endsWith('.html')) parts[parts.length - 1] = last.slice(0, -5)
  return '/' + parts.map(encodeURIComponent).join('/')
}

async function head(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method: 'HEAD',
        redirect: 'manual',
      })
      if (res.status >= 500 && attempt < 3) continue
      return { status: res.status, type: res.headers.get('content-type') ?? '' }
    } catch (err) {
      if (attempt >= 3) return { status: 0, type: String(err) }
    }
  }
}

async function check(rel) {
  const path = urlPath(rel)
  const page = rel.endsWith('.html')
  const { status, type } = await head(path)
  const html = /^text\/html\b/i.test(type)
  if (status !== 200) return `${path} (${rel}): HTTP ${status}`
  if (page && !html) return `${path} (${rel}): page served as ${type}`
  if (!page && html) return `${path} (${rel}): served as ${type}`
  return null
}

const all = files(DIST).map(f => relative(DIST, f))
const problems = []
let next = 0
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, all.length) }, async () => {
    while (next < all.length) {
      const problem = await check(all[next++])
      if (problem) problems.push(problem)
    }
  })
)

for (const p of problems.sort()) console.error(`::error::not deployed: ${p}`)
console.error(
  `${all.length} files checked on ${BASE}: ${problems.length} not deployed`
)
process.exit(problems.length ? 1 : 0)
