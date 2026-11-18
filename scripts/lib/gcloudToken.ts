/**
 * Mints a Google access token through `gcloud auth print-access-token` (#2980).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const MINT_TIMEOUT_MS = 60_000

export type ExecFile = (
  file: string,
  args: string[],
  options: { timeout: number }
) => Promise<{ stdout: string; stderr: string }>

export const makeMintToken = (run: ExecFile) => async (): Promise<string> => {
  const { stdout } = await run('gcloud', ['auth', 'print-access-token'], {
    timeout: 0,
  })
  const token = stdout.trim()
  if (!token) throw new Error('gcloud returned no token')
  return token
}

export const mintToken = makeMintToken(promisify(execFile))
