/**
 * #2980: the real mintToken shells out to `gcloud auth print-access-token`.
 * The execFile is injected, so no gcloud is needed. Whatever gcloud prints
 * (stdout holds a credential, stderr may echo one) must never reach an error.
 */
import { describe, it, expect, vi } from 'vitest'
import { makeMintToken, MINT_TIMEOUT_MS, type ExecFile } from '../gcloudToken'

const FIXED = 'could not mint a fresh access token'

const ok =
  (stdout: string): ExecFile =>
  async () => ({ stdout, stderr: '' })

const failing =
  (props: Record<string, unknown>): ExecFile =>
  async () => {
    throw Object.assign(new Error('Command failed: gcloud ya29.FAKE-in-argv'), {
      stdout: 'ya29.FAKE-stdout-secret',
      stderr: 'ERROR: ya29.FAKE-stderr-secret',
      ...props,
    })
  }

describe('mintToken (#2980)', () => {
  it('returns stdout trimmed', async () => {
    const mint = makeMintToken(ok('ya29.fresh\n'))
    expect(await mint()).toBe('ya29.fresh')
  })

  it('runs gcloud with a 60 s timeout and no token in argv', async () => {
    const exec = vi.fn(ok('ya29.fresh\n'))
    await makeMintToken(exec)()
    expect(MINT_TIMEOUT_MS).toBe(60_000)
    expect(exec).toHaveBeenCalledWith(
      'gcloud',
      ['auth', 'print-access-token'],
      { timeout: 60_000 }
    )
  })

  it('an empty stdout gives the fixed message', async () => {
    await expect(makeMintToken(ok('  \n'))()).rejects.toThrow(FIXED)
  })

  it.each([
    ['a non-zero exit', { code: 1 }],
    ['a timeout', { killed: true, signal: 'SIGTERM', code: null }],
  ])('%s gives the fixed message and leaks nothing', async (_n, props) => {
    const err = await makeMintToken(failing(props))().catch((e: Error) => e)
    expect((err as Error).message).toBe(FIXED)
    expect(String((err as Error).message)).not.toMatch(/FAKE|ya29/)
    expect(String((err as Error).stack)).not.toMatch(/FAKE-(stdout|stderr)/)
    expect((err as Error).cause).toBeUndefined()
  })
})
