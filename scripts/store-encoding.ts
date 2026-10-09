/**
 * Store Encoding Gate — Runner (#1702)
 *
 * Thin glue around ./lib/storeEncoding.js. Two subcommands:
 *
 *   normalize <path...>  Run right after a store is downloaded from GCS.
 *                        Peels every gzip layer off every *.json in place.
 *                        Exit 1 if any existing file is still not JSON
 *                        (a corrupt store must fail the run, not "continue").
 *   check <path...>      Run right before a `gcloud storage cp -Z` upload.
 *                        Exit 1 if any *.json is still gzip: uploading it
 *                        with -Z would add another encoding layer.
 *
 * Missing paths are the "store not created yet" case and pass. Decision
 * logic is unit-tested in scripts/lib/__tests__/storeEncoding.test.ts.
 * All logging goes to stderr (R4).
 *
 * Usage: npx tsx scripts/store-encoding.ts <normalize|check> <path> [...]
 */

import { appendFileSync } from 'node:fs'
import {
  findGzippedStoreFiles,
  normalizeStoreFiles,
} from './lib/storeEncoding.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function appendStepSummary(markdown: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) appendFileSync(summaryFile, markdown)
}

function main(argv: string[]): number {
  const [command, ...paths] = argv
  if ((command !== 'normalize' && command !== 'check') || paths.length === 0) {
    log('Usage: store-encoding.ts <normalize|check> <path> [...]')
    return 2
  }

  if (command === 'normalize') {
    const result = normalizeStoreFiles(paths)
    const maxLayers = Math.max(0, ...result.peeled.map(p => p.layers))
    log(
      `[store-encoding] normalize ${paths.join(' ')}: ${result.files} file(s), ` +
        `${result.peeled.length} peeled (max ${maxLayers} layer(s)), ` +
        `${result.failures.length} unparseable`
    )
    appendStepSummary(
      `- **Store encoding** (${paths.join(', ')}): ${result.files} files, ` +
        `${result.peeled.length} un-gzipped (max ${maxLayers} layers), ` +
        `${result.failures.length} unparseable\n`
    )
    for (const f of result.failures) {
      log(`::error file=${f.file}::store file is not JSON: ${f.reason}`)
    }
    return result.failures.length === 0 ? 0 : 1
  }

  const gzipped = findGzippedStoreFiles(paths)
  if (gzipped.length === 0) {
    log(`[store-encoding] check ${paths.join(' ')}: no gzip-encoded files`)
    return 0
  }
  for (const file of gzipped.slice(0, 20)) {
    log(
      `::error file=${file}::already gzip; a -Z upload would double-encode it`
    )
  }
  log(
    `[store-encoding] check failed: ${gzipped.length} gzip-encoded file(s) ` +
      'would be double-encoded by the -Z upload'
  )
  return 1
}

process.exitCode = main(process.argv.slice(2))
