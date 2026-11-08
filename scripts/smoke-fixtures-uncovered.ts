#!/usr/bin/env tsx
/**
 * smoke-fixtures-uncovered.ts — which CDN paths did a record run request that
 * the manifest does not produce? (#2545)
 *
 *   SMOKE_FIXTURES_RECORD_FILE=rec.txt BASE_URL=... npx playwright test ...
 *   tsx scripts/smoke-fixtures-uncovered.ts rec.txt
 *
 * Resolves the manifest against the live CDN dates (three small reads), then
 * prints each recorded path with no manifest entry. Exit 1 if there is any:
 * add it to scripts/smoke-fixtures.manifest.json. Logs to stderr (R4); the
 * uncovered paths go to stdout, one per line.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cdnFetch } from './refresh-smoke-fixtures.js'
import {
  expandManifest,
  loadExpandVars,
  parseManifest,
  uncoveredPaths,
} from './lib/smokeFixtures.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main(): Promise<number> {
  const recordFile = process.argv[2]
  if (!recordFile) {
    console.error('usage: smoke-fixtures-uncovered.ts <record-file>')
    return 2
  }
  const manifest = parseManifest(
    JSON.parse(
      readFileSync(
        resolve(ROOT, 'scripts/smoke-fixtures.manifest.json'),
        'utf8'
      )
    )
  )
  const json = async (path: string): Promise<unknown> => {
    const res = await cdnFetch(`${manifest.origin}/${path}`)
    if (res.status !== 200) throw new Error(`${path}: HTTP ${res.status}`)
    return JSON.parse(new TextDecoder().decode(res.body))
  }
  const resolved = expandManifest(
    manifest,
    await loadExpandVars(manifest, json)
  )
  const recorded = readFileSync(recordFile, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  const missing = uncoveredPaths(recorded, resolved)
  for (const p of missing) console.log(p)
  console.error(
    `${new Set(recorded).size} recorded path(s), ${missing.length} not in the manifest`
  )
  return missing.length === 0 ? 0 : 1
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
)
