/**
 * #2872 (B0), tightened in #3025: scripts/setup-wif.sh sets up the WIF pool
 * and provider only. It must not create a service account or grant any role,
 * and must not bind repo-wide workloadIdentityUser. The per-job identities
 * (scripts/lib/gcpIdentityMap.ts) are the only deploy identities, so a re-run
 * of the script must not bring back the shared deployer.
 *
 * The checks are pure functions (scripts/lib/setupWifChecks.ts). Each bypass
 * below is a fixture built from the real script, and must be flagged.
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
  // Still granted to the shared deployer before #3025.
  'roles/storage.admin',
  'roles/firebasehosting.admin',
  'roles/serviceusage.serviceUsageConsumer',
  'roles/iam.workloadIdentityUser',
]

describe('setup-wif.sh grants nothing (#3025)', () => {
  it('passes every check as committed', () => {
    expect(checkSetupWif(real())).toEqual([])
  })

  it.each(REMOVED_ROLES)('does not mention %s', role => {
    expect(stripComments(real())).not.toContain(role)
  })

  it('creates no service account and binds no IAM policy', () => {
    const code = stripComments(real())
    expect(code).not.toMatch(/service-accounts\s+create/)
    expect(code).not.toMatch(/add-iam-policy-binding/)
    expect(code).not.toMatch(/workloadIdentityUser/i)
  })

  it('does not default to the production project', () => {
    expect(stripComments(real())).not.toContain('toast-stats-prod-6d64a')
  })

  describe('bypass fixtures are flagged', () => {
    const add = (extra: string) => `${real()}\n${extra}\n`
    const bypasses: Record<string, string> = {
      'shared deployer creation': add(
        'gcloud iam service-accounts create toast-stats-deployer --project=p'
      ),
      'project role grant to a per-job identity': add(
        'gcloud projects add-iam-policy-binding p --member="serviceAccount:x@p.iam.gserviceaccount.com" --role="roles/storage.objectViewer"'
      ),
      'repo-wide workloadIdentityUser': add(
        'gcloud iam service-accounts add-iam-policy-binding x --role="roles/iam.workloadIdentityUser" --member="principalSet://iam.googleapis.com/pool/attribute.repository/r"'
      ),
      'variable-built role': add('echo "roles/${EXTRA_ROLE}"'),
      'principalSet member only': add('echo principalSet://x'),
      'set-iam-policy': add('gcloud projects set-iam-policy x p.json'),
      'project custom role path': add('echo projects/p/roles/custom'),
      'deploy secret output': add('echo "GCP_SERVICE_ACCOUNT = x"'),
      'sourced file': add('source ./other.sh'),
      'dot-sourced file': add('. ./other.sh'),
      eval: add('eval "$CMD"'),
      'bash invocation': add('bash grant.sh'),
      'relative script invocation': add('./scripts/grant.sh'),
      'default project restored': real().replace(
        /PROJECT_ID="\$\{PROJECT_ID:\?[^}]*\}"/,
        'PROJECT_ID="${PROJECT_ID:-some-project}"'
      ),
    }
    it.each(Object.entries(bypasses))('%s', (_name, text) => {
      expect(checkSetupWif(text)).not.toEqual([])
    })
  })
})
