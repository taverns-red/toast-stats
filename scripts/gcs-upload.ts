/**
 * Create-only GCS upload for the media jobs (#2972): see
 * scripts/lib/gcsUploadCli.ts for the subcommands and exit codes.
 * Env: ACCESS_TOKEN (a Google access token, never printed).
 * A long `copy` re-mints with `gcloud auth print-access-token` (#2980); the
 * token comes back on stdout, never through argv or a log line.
 * stderr: one status line (R4).
 */
import { mintToken } from './lib/gcloudToken.js'
import { runUploadCli } from './lib/gcsUploadCli.js'

void runUploadCli(process.argv.slice(2), {
  token: process.env['ACCESS_TOKEN'],
  mintToken,
  fetch,
  log: line => console.error(line),
}).then(code => {
  // exitCode, not process.exit(): let output flush.
  process.exitCode = code
})
