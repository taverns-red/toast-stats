/**
 * #2966: the identity smoke's I/O, with `fetch` and the output sinks
 * injected so a test can drive the fail-closed paths. Only GET requests.
 * Returns the exit code: 0 pass - 1 mismatch or API failure - 2 usage.
 *
 * APIs: https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/testIamPermissions
 *       https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list
 */
import {
  evaluate,
  permissionsToTest,
  type IdentityExpectation,
} from './identitySmoke.js'

const API = 'https://storage.googleapis.com/storage/v1/b'

export interface SmokeDeps {
  token: string | undefined
  fetch: typeof fetch
  /** Human-readable table (stderr, R4). */
  log: (line: string) => void
  /** The one JSON result (stdout). */
  out: (line: string) => void
}

const getJson = async (
  url: string,
  token: string,
  fetchFn: typeof fetch
): Promise<unknown> => {
  const res = await fetchFn(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(
      `GET ${url.split('?')[0]} -> ${res.status} ${res.statusText}`
    )
  }
  return res.json()
}

const heldPermissions = async (
  bucket: string,
  permissions: string[],
  token: string,
  fetchFn: typeof fetch
): Promise<string[]> => {
  const query = permissions
    .map(p => `permissions=${encodeURIComponent(p)}`)
    .join('&')
  const body = (await getJson(
    `${API}/${encodeURIComponent(bucket)}/iam/testPermissions?${query}`,
    token,
    fetchFn
  )) as { permissions?: string[] }
  return body.permissions ?? []
}

/** Count of soft-deleted objects under a prefix (first page, up to 1000). */
const countSoftDeleted = async (
  bucket: string,
  prefix: string,
  token: string,
  fetchFn: typeof fetch
): Promise<{ count: number; more: boolean }> => {
  const url =
    `${API}/${encodeURIComponent(bucket)}/o?softDeleted=true` +
    `&prefix=${encodeURIComponent(prefix)}&maxResults=1000`
  const body = (await getJson(url, token, fetchFn)) as {
    items?: unknown[]
    nextPageToken?: string
  }
  return { count: body.items?.length ?? 0, more: Boolean(body.nextPageToken) }
}

const check = async (
  expected: IdentityExpectation,
  token: string,
  deps: SmokeDeps
): Promise<number> => {
  const actual: Record<string, string[]> = {}
  for (const [bucket, exp] of Object.entries(expected.buckets)) {
    actual[bucket] = await heldPermissions(
      bucket,
      permissionsToTest(exp),
      token,
      deps.fetch
    )
  }
  const result = evaluate(expected, actual)

  deps.log(`identity: ${expected.identity}`)
  for (const [bucket, exp] of Object.entries(expected.buckets)) {
    const held = new Set(actual[bucket])
    for (const p of exp.granted)
      deps.log(
        `${held.has(p) ? 'ok  ' : 'FAIL'} ${bucket} granted ${p} -> ${held.has(p) ? 'held' : 'NOT held'}`
      )
    for (const p of exp.denied)
      deps.log(
        `${held.has(p) ? 'FAIL' : 'ok  '} ${bucket} denied  ${p} -> ${held.has(p) ? 'HELD' : 'not held'}`
      )
  }

  let softDeleted: { count: number; more: boolean } | undefined
  if (expected.softDeletedProbe) {
    const { bucket, prefix } = expected.softDeletedProbe
    softDeleted = await countSoftDeleted(bucket, prefix, token, deps.fetch)
    deps.log(
      `soft-deleted objects under gs://${bucket}/${prefix}: ${softDeleted.count}${softDeleted.more ? '+' : ''}`
    )
  }

  deps.log(
    result.pass ? 'PASS' : `FAIL: ${result.mismatches.length} mismatch(es)`
  )
  deps.out(
    JSON.stringify({ ...result, identity: expected.identity, softDeleted })
  )
  return result.pass ? 0 : 1
}

export const runSmoke = async (
  expected: IdentityExpectation,
  deps: SmokeDeps
): Promise<number> => {
  if (!deps.token) {
    deps.log('ACCESS_TOKEN is not set')
    return 2
  }
  try {
    return await check(expected, deps.token, deps)
  } catch (err) {
    deps.log(err instanceof Error ? err.message : String(err))
    return 1
  }
}
