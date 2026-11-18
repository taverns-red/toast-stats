/**
 * #2972: object-level checks. A grant conditioned on an object-name prefix is
 * invisible to buckets.testIamPermissions, so the smoke also asks
 * objects.testIamPermissions on paths inside and outside the prefix.
 */
import { describe, it, expect, vi } from 'vitest'
import { evaluate, type IdentityExpectation } from '../identitySmoke'
import { runSmoke } from '../identitySmokeCli'

const exp: IdentityExpectation = {
  identity: 'o',
  buckets: { b: { granted: [], denied: ['storage.buckets.get'] } },
  objectChecks: [
    {
      bucket: 'b',
      object: 'in/x',
      granted: ['storage.objects.create'],
      denied: ['storage.objects.delete'],
    },
    {
      bucket: 'b',
      object: 'out/x',
      granted: [],
      denied: ['storage.objects.create'],
    },
  ],
}

describe('evaluate with object checks (#2972)', () => {
  it('passes when each object answer matches', () => {
    const r = evaluate(
      exp,
      { b: [] },
      { 'b/in/x': ['storage.objects.create'], 'b/out/x': [] }
    )
    expect(r).toEqual({ pass: true, mismatches: [] })
  })

  it('names the object when a grant is missing or unexpected', () => {
    const r = evaluate(
      exp,
      { b: [] },
      { 'b/in/x': [], 'b/out/x': ['storage.objects.create'] }
    )
    expect(r.mismatches).toEqual([
      {
        bucket: 'b',
        object: 'in/x',
        permission: 'storage.objects.create',
        problem: 'missing-grant',
      },
      {
        bucket: 'b',
        object: 'out/x',
        permission: 'storage.objects.create',
        problem: 'unexpected-grant',
      },
    ])
  })

  it('treats an object with no answer as holding nothing', () => {
    expect(evaluate(exp, { b: [] }).pass).toBe(false)
  })
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

const withObjects: IdentityExpectation = {
  identity: 'o',
  buckets: { 'bucket-a': { granted: [], denied: ['storage.buckets.get'] } },
  objectChecks: [
    {
      bucket: 'bucket-a',
      object: 'videos/identity-smoke/probe.mp4',
      granted: ['storage.objects.create'],
      denied: ['storage.objects.delete'],
    },
  ],
}

const deps = (
  fetchFn: unknown,
  log: (l: string) => void = () => {}
): Parameters<typeof runSmoke>[1] => ({
  token: 't',
  fetch: fetchFn as typeof fetch,
  log,
  out: () => {},
})

describe('runSmoke object checks (#2972)', () => {
  it('asks objects.testIamPermissions with the object path encoded, GET only', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('/o/')
        ? json({ permissions: ['storage.objects.create'] })
        : json({ permissions: [] })
    )
    expect(await runSmoke(withObjects, deps(fetchFn))).toBe(0)
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][]
    const objectCall = calls.find(c => c[0].includes('/o/'))!
    expect(objectCall[0]).toContain(
      '/b/bucket-a/o/videos%2Fidentity-smoke%2Fprobe.mp4/iam/testPermissions?'
    )
    expect(objectCall[0]).toContain('permissions=storage.objects.create')
    expect(objectCall[0]).toContain('permissions=storage.objects.delete')
    for (const c of calls) expect(c[1].method).toBe('GET')
  })

  it('exits 1 when the object answer has an unexpected grant', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('/o/')
        ? json({
            permissions: ['storage.objects.create', 'storage.objects.delete'],
          })
        : json({ permissions: [] })
    )
    expect(await runSmoke(withObjects, deps(fetchFn))).toBe(1)
  })

  it('fails closed when the object answers 404, naming the status', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('/o/')
        ? json({ error: 'nf' }, 404)
        : json({ permissions: [] })
    )
    const logs: string[] = []
    const code = await runSmoke(
      withObjects,
      deps(fetchFn, l => logs.push(l))
    )
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('404')
  })
})
