/**
 * #2966: the identity smoke CLI fails closed. Any API error exits non-zero,
 * a permission mismatch exits non-zero, and only an exact match exits 0.
 */
import { describe, it, expect, vi } from 'vitest'
import { runSmoke } from '../identitySmokeCli'
import type { IdentityExpectation } from '../identitySmoke'

const expected: IdentityExpectation = {
  identity: 'sample',
  buckets: {
    'bucket-a': {
      granted: ['storage.objects.get'],
      denied: ['storage.buckets.get'],
    },
  },
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

const deps = (
  fetchFn: unknown,
  out: (line: string) => void = () => {}
): Parameters<typeof runSmoke>[1] => ({
  token: 't',
  fetch: fetchFn as typeof fetch,
  log: () => {},
  out,
})

describe('runSmoke (#2966)', () => {
  it('exits 0 on an exact match, with GET requests only', async () => {
    const fetchFn = vi.fn(async () =>
      json({ permissions: ['storage.objects.get'] })
    )
    const out = vi.fn()
    const code = await runSmoke(expected, deps(fetchFn, out))
    expect(code).toBe(0)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.method).toBe('GET')
    expect(JSON.parse(out.mock.calls[0]![0] as string).pass).toBe(true)
  })

  it('exits 1 on a mismatch', async () => {
    const fetchFn = vi.fn(async () =>
      json({ permissions: ['storage.objects.get', 'storage.buckets.get'] })
    )
    expect(await runSmoke(expected, deps(fetchFn))).toBe(1)
  })

  it.each([400, 403])(
    'exits non-zero when the API answers %i',
    async status => {
      const fetchFn = vi.fn(async () => json({ error: 'x' }, status))
      const out = vi.fn()
      const code = await runSmoke(expected, deps(fetchFn, out))
      expect(code).not.toBe(0)
      expect(out).not.toHaveBeenCalled()
    }
  )

  it('exits non-zero when fetch itself rejects', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    expect(await runSmoke(expected, deps(fetchFn))).not.toBe(0)
  })

  it('exits 2 without a token and makes no request', async () => {
    const fetchFn = vi.fn()
    const code = await runSmoke(expected, {
      ...deps(fetchFn),
      token: undefined,
    })
    expect(code).toBe(2)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
