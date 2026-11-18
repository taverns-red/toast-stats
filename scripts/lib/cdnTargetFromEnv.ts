/**
 * Resolves the CDN target from the environment or `--base URL` at import
 * time and exits 2 with a stderr message when there is none (#2974).
 *
 * check-cdn-schema.ts imports this FIRST so the refusal happens before its
 * other imports (the built shared-contracts package) are loaded.
 */

import { cdnTargetOrExit } from './cdnTarget.js'

const args = process.argv.slice(2)
const i = args.indexOf('--base')

export const CDN_TARGET = cdnTargetOrExit(
  'check-cdn-schema.ts',
  process.env,
  i >= 0 ? args[i + 1] : undefined
)
