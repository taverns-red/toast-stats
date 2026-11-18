/**
 * Mints a Google access token through `gcloud auth print-access-token` (#2980).
 *
 * gcloud keeps its own token cache and refreshes only within 5 minutes of
 * expiry, so the caller has to ask often (see tokenMaxAgeMs in gcsUpload.ts).
 * Whatever gcloud prints, stdout (the token) or stderr (may echo one), never
 * goes into an error: every failure, including a timeout, gets the same
 * fixed message.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const MINT_TIMEOUT_MS = 60_000

const FAILED = 'could not mint a fresh access token'

export type ExecFile = (
  file: string,
  args: string[],
  options: { timeout: number }
) => Promise<{ stdout: string; stderr: string }>

export const makeMintToken = (run: ExecFile) => async (): Promise<string> => {
  let stdout: string
  try {
    ;({ stdout } = await run('gcloud', ['auth', 'print-access-token'], {
      timeout: MINT_TIMEOUT_MS,
    }))
  } catch {
    throw new Error(FAILED)
  }
  const token = stdout.trim()
  if (!token) throw new Error(FAILED)
  return token
}

export const mintToken = makeMintToken(promisify(execFile))
