/**
 * Create-only GCS upload for the media jobs (#2972): see
 * scripts/lib/gcsUploadCli.ts for the subcommands and exit codes.
 * Env: ACCESS_TOKEN (a Google access token, never printed).
 * stderr: one status line (R4).
 */
import { runUploadCli } from './lib/gcsUploadCli.js'

void runUploadCli(process.argv.slice(2), {
  token: process.env['ACCESS_TOKEN'],
  fetch,
  log: line => console.error(line),
}).then(code => {
  // exitCode, not process.exit(): let output flush.
  process.exitCode = code
})
