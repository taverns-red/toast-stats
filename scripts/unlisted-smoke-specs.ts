#!/usr/bin/env tsx
/**
 * Print the smoke specs no named pr-preview.yml step runs (#2141), one
 * `e2e/...` path per line, for the workflow's catch-all step. Logic lives in
 * `scripts/lib/smokeSpecCoverage.ts`. R4: the note goes to stderr; stdout is
 * only the list.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  namedSmokeSpecs,
  toSpecPaths,
  unlistedSmokeSpecs,
} from './lib/smokeSpecCoverage'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(
  join(root, '.github/workflows/pr-preview.yml'),
  'utf-8'
)
const specs = toSpecPaths(
  readdirSync(join(root, 'frontend/e2e'), {
    recursive: true,
    encoding: 'utf-8',
  })
)
const unlisted = unlistedSmokeSpecs(specs, namedSmokeSpecs(workflow))
console.error(
  `${specs.length} smoke specs, ${unlisted.length} without a named step`
)
if (unlisted.length > 0) process.stdout.write(`${unlisted.join('\n')}\n`)
