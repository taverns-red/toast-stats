#!/usr/bin/env tsx
/**
 * refresh-smoke-fixtures.ts — record the CDN objects the PR Preview shards
 * read, once per run, and schema-check them (#2545).
 *
 *   tsx scripts/refresh-smoke-fixtures.ts --out <dir> [--manifest <file>]
 *
 * Reads scripts/smoke-fixtures.manifest.json, fetches every object it names
 * from the manifest's origin (cdn-staging), validates each with the reader
 * schema the frontend parses it with, and writes `<dir>/<path>` plus
 * `<dir>/_index.json`. Read-only against the CDN; writes only under --out.
 * Exits 1 when any object is missing, unreadable or fails its schema, so a
 * staging schema drift fails the `fixtures` job before any shard starts.
 *
 * Logs go to stderr (R4); stdout is empty.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatReport,
  parseManifest,
  refreshFixtures,
  type FetchedObject,
} from './lib/smokeFixtures.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** GET with one retry; fetch peels one Content-Encoding layer, like a browser. */
export async function cdnFetch(url: string): Promise<FetchedObject> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (res.status >= 500 && attempt === 0) continue
      return {
        status: res.status,
        contentType:
          res.headers.get('content-type') ?? 'application/octet-stream',
        body: new Uint8Array(await res.arrayBuffer()),
      }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function main(): Promise<number> {
  const out = arg('out')
  if (!out) {
    console.error(
      'usage: refresh-smoke-fixtures.ts --out <dir> [--manifest <file>]'
    )
    return 2
  }
  const manifestFile =
    arg('manifest') ?? resolve(ROOT, 'scripts/smoke-fixtures.manifest.json')
  const manifest = parseManifest(JSON.parse(readFileSync(manifestFile, 'utf8')))
  const report = await refreshFixtures({
    manifest,
    outDir: out,
    fetchFn: cdnFetch,
    readLocal: rel => readFileSync(resolve(ROOT, rel)),
  })
  console.error(formatReport(report))
  return report.ok ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    code => process.exit(code),
    err => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  )
}
