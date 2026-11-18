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

describe('runSmoke project checks (#2984)', () => {
  const withProject: IdentityExpectation = {
    identity: 'sample',
    buckets: {},
    projectChecks: { granted: ['p.get'], denied: ['p.setIam'] },
  }
  const projectDeps = (fetchFn: unknown): Parameters<typeof runSmoke>[1] => ({
    ...deps(fetchFn),
    projectId: 'proj-1',
  })

  it('POSTs testIamPermissions to the project and passes on an exact match', async () => {
    const fetchFn = vi.fn(async () => json({ permissions: ['p.get'] }))
    expect(await runSmoke(withProject, projectDeps(fetchFn))).toBe(0)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://cloudresourcemanager.googleapis.com/v1/projects/proj-1:testIamPermissions'
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      permissions: ['p.get', 'p.setIam'],
    })
  })

  it('exits 1 when a denied project permission is held', async () => {
    const fetchFn = vi.fn(async () =>
      json({ permissions: ['p.get', 'p.setIam'] })
    )
    expect(await runSmoke(withProject, projectDeps(fetchFn))).toBe(1)
  })

  it('exits 1 when the API answers 403', async () => {
    const fetchFn = vi.fn(async () => json({ error: 'x' }, 403))
    expect(await runSmoke(withProject, projectDeps(fetchFn))).toBe(1)
  })

  it('exits 2 without a project id and makes no request', async () => {
    const fetchFn = vi.fn()
    expect(await runSmoke(withProject, deps(fetchFn))).toBe(2)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
