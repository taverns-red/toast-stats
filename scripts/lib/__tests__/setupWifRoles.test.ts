/**
 * #2872 (B0): scripts/setup-wif.sh grants exactly the roles the deployer still
 * needs. The six roles removed in Step 0 (2026-11-15) must not come back, and
 * nothing else may be granted by another route.
 *
 * The checks are pure functions (scripts/lib/setupWifChecks.ts). Each bypass
 * below is a fixture built by mutating the real script, and must be flagged.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { checkSetupWif, stripComments } from '../setupWifChecks'

const FILE = path.resolve(process.cwd(), 'scripts/setup-wif.sh')
const real = () => fs.readFileSync(FILE, 'utf-8')

const REMOVED_ROLES = [
  'roles/run.admin',
  'roles/iam.serviceAccountUser',
  'roles/apigateway.admin',
  'roles/servicemanagement.admin',
  'roles/artifactregistry.writer',
  'roles/cloudbuild.builds.builder',
]

const LAST = '"roles/serviceusage.serviceUsageConsumer"'
const LOOP_ROLE = '--role="${ROLE}"'

/** The real script with one exact substring replaced; fails if not found. */
const mutate = (from: string, to: string): string => {
  const text = real()
  expect(text, `fixture anchor missing: ${from}`).toContain(from)
  return text.replace(from, to)
}

describe('setup-wif.sh role grants (#2872 B0)', () => {
  it('passes every check as committed', () => {
    expect(checkSetupWif(real())).toEqual([])
  })

  it.each(REMOVED_ROLES)('does not grant %s', role => {
    expect(stripComments(real())).not.toContain(role)
  })

  describe('bypass fixtures are flagged', () => {
    const bypasses: Record<string, string> = {
      'unquoted ROLES entry': mutate(LAST, `${LAST}\n  roles/editor`),
      'quoted extra ROLES entry': mutate(LAST, `${LAST}\n  "roles/editor"`),
      'prefix-concatenated ROLES entry': mutate(
        LAST,
        `${LAST}\n  "roles/"editor`
      ),
      'variable-built role literal': mutate(
        LOOP_ROLE,
        '--role="roles/${EXTRA_ROLE}"'
      ),
      'loop --role not exactly ${ROLE}': mutate(
        LOOP_ROLE,
        '--role="${ROLE}-extra"'
      ),
      'set-iam-policy': `${real()}\ngcloud projects set-iam-policy x p.json\n`,
      'project custom role path': `${real()}\necho projects/p/roles/custom\n`,
      'sourced file': `${real()}\nsource ./other.sh\n`,
      'dot-sourced file': `${real()}\n. ./other.sh\n`,
      eval: `${real()}\neval "$CMD"\n`,
      'bash invocation': `${real()}\nbash grant.sh\n`,
      'relative script invocation': `${real()}\n./scripts/grant.sh\n`,
      'third add-iam-policy-binding': `${real()}\ngcloud projects add-iam-policy-binding p --role="roles/iam.workloadIdentityUser"\n`,
    }
    it.each(Object.entries(bypasses))('%s', (_name, text) => {
      expect(checkSetupWif(text)).not.toEqual([])
    })
  })
})
