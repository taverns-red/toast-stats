/**
 * Read-only identity smoke (#2966, epic #2872).
 *
 *   identity-smoke.ts <identity>      env ACCESS_TOKEN (a Google access token)
 *
 * Asks the Cloud Storage JSON API which of the expected permissions the
 * caller holds on each bucket (buckets.testIamPermissions), compares both
 * directions with scripts/lib/identitySmoke.ts, and counts soft-deleted
 * objects under one small prod prefix (objects.list, softDeleted=true).
 * Only GET requests. stderr: the table (R4); stdout: one JSON result.
 * Exit: 0 pass - 1 mismatch or API failure - 2 usage.
 *
 * APIs: https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/testIamPermissions
 *       https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list
 */

import {
  IDENTITY_EXPECTATIONS,
  evaluate,
  permissionsToTest,
  type IdentityExpectation,
} from './lib/identitySmoke.js'

const API = 'https://storage.googleapis.com/storage/v1/b'

const getJson = async (url: string, token: string): Promise<unknown> => {
  const res = await fetch(url, {
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
  token: string
): Promise<string[]> => {
  const query = permissions
    .map(p => `permissions=${encodeURIComponent(p)}`)
    .join('&')
  const body = (await getJson(
    `${API}/${encodeURIComponent(bucket)}/iam/testPermissions?${query}`,
    token
  )) as { permissions?: string[] }
  return body.permissions ?? []
}

/** Count of soft-deleted objects under a prefix (first page, up to 1000). */
const countSoftDeleted = async (
  bucket: string,
  prefix: string,
  token: string
): Promise<{ count: number; more: boolean }> => {
  const url =
    `${API}/${encodeURIComponent(bucket)}/o?softDeleted=true` +
    `&prefix=${encodeURIComponent(prefix)}&maxResults=1000`
  const body = (await getJson(url, token)) as {
    items?: unknown[]
    nextPageToken?: string
  }
  return { count: body.items?.length ?? 0, more: Boolean(body.nextPageToken) }
}

const run = async (expected: IdentityExpectation): Promise<number> => {
  const token = process.env['ACCESS_TOKEN']
  if (!token) {
    console.error('ACCESS_TOKEN is not set')
    return 2
  }
  const actual: Record<string, string[]> = {}
  for (const [bucket, exp] of Object.entries(expected.buckets)) {
    actual[bucket] = await heldPermissions(
      bucket,
      permissionsToTest(exp),
      token
    )
  }
  const result = evaluate(expected, actual)

  console.error(`identity: ${expected.identity}`)
  for (const [bucket, exp] of Object.entries(expected.buckets)) {
    const held = new Set(actual[bucket])
    for (const p of exp.granted)
      console.error(
        `${held.has(p) ? 'ok  ' : 'FAIL'} ${bucket} granted ${p} -> ${held.has(p) ? 'held' : 'NOT held'}`
      )
    for (const p of exp.denied)
      console.error(
        `${held.has(p) ? 'FAIL' : 'ok  '} ${bucket} denied  ${p} -> ${held.has(p) ? 'HELD' : 'not held'}`
      )
  }

  let softDeleted: { count: number; more: boolean } | undefined
  if (expected.softDeletedProbe) {
    const { bucket, prefix } = expected.softDeletedProbe
    softDeleted = await countSoftDeleted(bucket, prefix, token)
    console.error(
      `soft-deleted objects under gs://${bucket}/${prefix}: ${softDeleted.count}${softDeleted.more ? '+' : ''}`
    )
  }

  console.error(
    result.pass ? 'PASS' : `FAIL: ${result.mismatches.length} mismatch(es)`
  )
  console.log(
    JSON.stringify({ ...result, identity: expected.identity, softDeleted })
  )
  return result.pass ? 0 : 1
}

const main = async (): Promise<number> => {
  const name = process.argv[2] ?? ''
  const expected = IDENTITY_EXPECTATIONS[name]
  if (!expected) {
    console.error(
      `usage: identity-smoke.ts <${Object.keys(IDENTITY_EXPECTATIONS).join('|')}>`
    )
    return 2
  }
  try {
    return await run(expected)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
}

void main().then(code => process.exit(code))
