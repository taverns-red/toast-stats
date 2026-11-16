/**
 * #2872 (B0): scripts/setup-wif.sh grants exactly the roles the deployer still
 * needs. The six roles removed in Step 0 (2026-11-15) must not come back, and
 * nothing else may be granted by another route.
 *
 * This is an allow list: the ROLES block is compared to an exact list, every
 * other `roles/` literal must be the WIF binding role, and the script may not
 * grant roles by a path this test cannot see.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const FILE = path.resolve(process.cwd(), 'scripts/setup-wif.sh')

const ALLOWED_ROLES = [
  'roles/storage.admin',
  'roles/firebasehosting.admin',
  'roles/serviceusage.serviceUsageConsumer',
]
const WIF_BINDING_ROLE = 'roles/iam.workloadIdentityUser'

const REMOVED_ROLES = [
  'roles/run.admin',
  'roles/iam.serviceAccountUser',
  'roles/apigateway.admin',
  'roles/servicemanagement.admin',
  'roles/artifactregistry.writer',
  'roles/cloudbuild.builds.builder',
]

/** Script text with whole-line comments removed, so a note can name a role. */
const code = () =>
  fs
    .readFileSync(FILE, 'utf-8')
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')

const rolesBlock = (): string[] => {
  const m = /^ROLES=\(\s*([\s\S]*?)\)/m.exec(code())
  expect(m, 'ROLES=( ... ) block not found').not.toBeNull()
  return [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1])
}

describe('setup-wif.sh role grants (#2872 B0)', () => {
  it('ROLES block is exactly the allow list', () => {
    expect(rolesBlock()).toEqual(ALLOWED_ROLES)
  })

  it('every roles/ literal outside the ROLES block is the WIF binding role', () => {
    const outside = code().replace(/^ROLES=\(\s*[\s\S]*?\)/m, '')
    const literals = [...outside.matchAll(/roles\/[A-Za-z0-9_.]+/g)].map(
      x => x[0]
    )
    expect(literals.length).toBeGreaterThan(0)
    expect(literals.filter(r => r !== WIF_BINDING_ROLE)).toEqual([])
  })

  it('has exactly two add-iam-policy-binding calls (ROLES loop, WIF binding)', () => {
    const calls = code().match(/add-iam-policy-binding/g) ?? []
    expect(calls).toHaveLength(2)
  })

  it('has no other route to grant roles', () => {
    const text = code()
    expect(text).not.toMatch(/set-iam-policy/)
    expect(text).not.toMatch(/projects\/[^\s"']*\/roles\//)
    expect(text).not.toMatch(/^\s*(source|\.)\s/m)
  })

  it.each(REMOVED_ROLES)('does not grant %s', role => {
    expect(code()).not.toContain(role)
  })
})
