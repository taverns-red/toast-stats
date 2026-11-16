/**
 * #2872: every workflow job that authenticates to GCP maps to exactly ONE
 * identity variable, recorded in EXPECTED (scripts/lib/gcpIdentityMap.ts).
 *
 * Fails when:
 * - a job authenticates to GCP and is not in EXPECTED (unclassified);
 * - a job authenticates with two different identities;
 * - an EXPECTED entry matches no authenticating job (stale entry);
 * - a job's identity differs from its entry;
 * - a job can mint an OIDC token (`id-token: write`, own or inherited) but is
 *   in neither EXPECTED nor NON_GCP_OIDC. The WIF binding admits any job with
 *   id-token on the repo, so id-token is the real capability;
 * - a job-level `uses:` is not in CALLERS;
 * - a workflow carries key credentials, or a step uses a local `./` action.
 */
import { describe, it, expect } from 'vitest'
import {
  EXPECTED,
  NON_GCP_OIDC,
  CALLERS,
  loadWorkflows,
  collectAuthJobs,
  collectIdTokenJobs,
  collectCallers,
  collectLocalUses,
  findForbiddenCredentials,
  type WorkflowFile,
} from '../gcpIdentityMap'

describe('GCP identity map (#2872)', () => {
  const files = loadWorkflows()
  const found = collectAuthJobs(files)

  it('classifies every GCP-authenticating job', () => {
    const unclassified = [...found.keys()].filter(k => !(k in EXPECTED))
    expect(unclassified).toEqual([])
  })

  it('uses exactly one identity per job', () => {
    const multi = [...found].filter(([, ids]) => ids.size !== 1).map(([k]) => k)
    expect(multi).toEqual([])
  })

  it('has no table entry without a matching job', () => {
    const stale = Object.keys(EXPECTED).filter(k => !found.has(k))
    expect(stale).toEqual([])
  })

  it('matches each job to its expected identity variable', () => {
    const actual = Object.fromEntries(
      [...found].map(([k, ids]) => [k, [...ids][0]])
    )
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).filter(([k]) => k in actual)
    )
    const comparable = Object.fromEntries(
      Object.keys(expected).map(k => [k, actual[k]])
    )
    expect(comparable).toEqual(expected)
  })

  it('classifies every job with id-token: write (own or inherited)', () => {
    const unclassified = collectIdTokenJobs(files).filter(
      k => !(k in EXPECTED) && !(k in NON_GCP_OIDC)
    )
    expect(unclassified).toEqual([])
  })

  it('grants id-token to exactly the GCP-authenticating jobs plus the deploy caller (#2879)', () => {
    expect(collectIdTokenJobs(files).sort()).toEqual(
      [...Object.keys(EXPECTED), ...Object.keys(NON_GCP_OIDC)].sort()
    )
  })

  it('has no NON_GCP_OIDC entry that is stale, unexplained or in EXPECTED', () => {
    const withToken = new Set(collectIdTokenJobs(files))
    const bad = Object.entries(NON_GCP_OIDC)
      .filter(
        ([k, reason]) => !withToken.has(k) || k in EXPECTED || !reason.trim()
      )
      .map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('lists every job-level uses: in CALLERS', () => {
    expect(collectCallers(files)).toEqual(CALLERS)
  })

  it('has no key credentials in any workflow', () => {
    expect(findForbiddenCredentials(files)).toEqual([])
  })

  it('has no local ./ action step', () => {
    expect(collectLocalUses(files)).toEqual([])
  })

  it('keys CALLERS by the full uses path, not the basename', () => {
    expect(CALLERS).toEqual({
      'release-please.yml::deploy': './.github/workflows/deploy.yml',
    })
  })
})

const fixture = (text: string, uses?: string): WorkflowFile => ({
  file: 'fixture.yml',
  text,
  wf: { jobs: uses ? { deploy: { uses } } : {} },
})

describe('GCP identity tripwire fixtures (#2872)', () => {
  it.each([
    ['export in a run block', 'run: export GOOGLE_APPLICATION_CREDENTIALS=/k'],
    ['env mapping', 'env:\n  GOOGLE_APPLICATION_CREDENTIALS: /k'],
    ['GOOGLE_GHA_CREDS_PATH', 'run: cat "$GOOGLE_GHA_CREDS_PATH"'],
    [
      'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
      'run: export CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=/k',
    ],
    ['credentials_json', 'credentials_json: ${{ secrets.K }}'],
    ['activate-service-account', 'run: gcloud auth activate-service-account'],
    ['--cred-file', 'run: gcloud auth login --cred-file=/k'],
  ])('flags %s', (_name, text) => {
    expect(findForbiddenCredentials([fixture(text)])).not.toEqual([])
  })

  it('leaves CLOUDSDK_AUTH_ACCESS_TOKEN_FILE alone', () => {
    expect(
      findForbiddenCredentials([
        fixture('env:\n  CLOUDSDK_AUTH_ACCESS_TOKEN_FILE: /t'),
      ])
    ).toEqual([])
  })

  it('records the full uses string, so a same-named workflow elsewhere differs', () => {
    expect(
      collectCallers([fixture('', './.github/workflows/sub/deploy.yml')])
    ).toEqual({
      'fixture.yml::deploy': './.github/workflows/sub/deploy.yml',
    })
  })
})
