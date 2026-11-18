/**
 * Create-only GCS upload for the media jobs (#2972): see
 * scripts/lib/gcsUploadCli.ts for the subcommands and exit codes.
 * Env: ACCESS_TOKEN (a Google access token, never printed).
 * A long `copy` re-mints with `gcloud auth print-access-token` (#2980); the
 * token comes back on stdout, never through argv or a log line.
 * stderr: one status line (R4).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runUploadCli } from './lib/gcsUploadCli.js'

const run = promisify(execFile)

const mintToken = async (): Promise<string> => {
  const { stdout } = await run('gcloud', ['auth', 'print-access-token'])
  const token = stdout.trim()
  if (!token) throw new Error('gcloud returned no token')
  return token
}

void runUploadCli(process.argv.slice(2), {
  token: process.env['ACCESS_TOKEN'],
  mintToken,
  fetch,
  log: line => console.error(line),
}).then(code => {
  // exitCode, not process.exit(): let output flush.
  process.exitCode = code
})
