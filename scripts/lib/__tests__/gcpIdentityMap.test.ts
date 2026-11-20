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
 * - the jobs with id-token are not exactly EXPECTED plus NON_GCP_OIDC (#2879),
 *   so no other job can inherit the capability;
 * - a job-level `uses:` is not in CALLERS;
 * - a workflow carries key credentials, or a step uses a local `./` action.
 */
import { describe, it, expect } from 'vitest'
import {
  DATA_READER,
  HOSTING_DEPLOY,
  HOSTING_DEPLOY_ENVIRONMENT,
  MEDIA,
  PIPELINE,
  PREVIEW,
  RESTORE,
  RESTORE_ENVIRONMENT,
  KNOWN_IDENTITIES,
  READER_GUARD_EXEMPT,
  byEvent,
  EXPECTED,
  NON_GCP_OIDC,
  CALLERS,
  loadWorkflows,
  collectAuthJobs,
  collectIdTokenJobs,
  collectCallers,
  collectEnvironments,
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

interface GuardStep {
  id?: string
  if?: unknown
  'continue-on-error'?: unknown
  uses?: string
  run?: string
  env?: Record<string, unknown>
}

const normCond = (v: unknown): string =>
  String(v ?? '')
    .replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Does `guard` stop the job whenever `auth` would run? A guard that never
 * runs, runs under a narrower condition, or fails without stopping the job
 * lets the auth action fall back to direct workload identity (#2963).
 */
const guardStopsAuth = (guard: GuardStep, auth: GuardStep): boolean => {
  const guardIf = normCond(guard.if)
  const authIf = normCond(auth.if)
  if (guardIf === 'false') return false
  // The auth step may wait for the guard's own success (a soft-failing guard).
  const escapedId = guard.id?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const waits = escapedId
    ? new RegExp(`(^| && )steps\\.${escapedId}\\.outcome == 'success'$`)
    : null
  const waitsForGuard = waits !== null && waits.test(authIf)
  const authBase = waitsForGuard ? authIf.replace(waits!, '') : authIf
  if (guardIf === '') {
    // No guard if: the guard runs under success(). An auth step that also
    // runs after a failure or cancellation would run past a failed guard.
    if (/\b(always|cancelled|failure)\s*\(/.test(authBase)) return false
  } else {
    // `&&` binds tighter than `||`, so a guard if with `||` must be
    // parenthesized before the success check is appended.
    const wrapped = `(${guardIf})`
    const equal =
      authBase === wrapped ||
      (authBase === guardIf && !(waitsForGuard && guardIf.includes('||')))
    if (!equal) return false
  }
  const soft =
    guard['continue-on-error'] !== undefined &&
    normCond(guard['continue-on-error']) !== 'false'
  return !soft || waitsForGuard
}

/**
 * Is the auth step at `authAt` preceded by a guard for the repository variable
 * `varName`? A guard has the variable in its env, an `-z` test and an
 * `exit 1` (#2872), and is configured so it really stops the job (#2963).
 */
const hasGuard = (
  steps: GuardStep[],
  authAt: number,
  varName: string
): boolean =>
  steps
    .slice(0, authAt)
    .some(
      s =>
        new RegExp(`vars\\.${varName}`).test(
          String(Object.values(s.env ?? {}))
        ) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '') &&
        guardStopsAuth(s, steps[authAt]!)
    )

describe('identity guard step configuration (#2963)', () => {
  const guard = (extra: Partial<GuardStep> = {}): GuardStep => ({
    id: 'reader',
    env: { READER_SA: '${{ vars.GCP_X_SA }}' },
    run: 'if [ -z "${READER_SA}" ]; then\n  exit 1\nfi',
    ...extra,
  })
  const auth = (extra: Partial<GuardStep> = {}): GuardStep => ({
    uses: 'google-github-actions/auth@v3',
    ...extra,
  })
  const check = (g: GuardStep, a: GuardStep) => hasGuard([g, a], 1, 'GCP_X_SA')

  it('accepts a plain guard before an auth step', () => {
    expect(check(guard(), auth())).toBe(true)
  })

  it('accepts a guard with the same if as the auth step', () => {
    const cond = "github.ref == 'refs/heads/main'"
    expect(check(guard({ if: cond }), auth({ if: cond }))).toBe(true)
  })

  it('accepts a soft-failing guard when the auth step needs its success', () => {
    const cond = "!cancelled() && github.ref == 'refs/heads/main'"
    expect(
      check(
        guard({ if: cond, 'continue-on-error': true }),
        auth({ if: `${cond} && steps.reader.outcome == 'success'` })
      )
    ).toBe(true)
  })

  it('rejects a guard disabled with if: false', () => {
    expect(check(guard({ if: false }), auth())).toBe(false)
    expect(check(guard({ if: 'false' }), auth())).toBe(false)
  })

  it('rejects a guard with continue-on-error that auth does not wait for', () => {
    expect(check(guard({ 'continue-on-error': true }), auth())).toBe(false)
    expect(check(guard({ 'continue-on-error': '${{ true }}' }), auth())).toBe(
      false
    )
  })

  it('rejects a guard whose if is narrower than the auth step', () => {
    expect(
      check(guard({ if: "github.ref == 'refs/heads/main'" }), auth())
    ).toBe(false)
    expect(
      check(
        guard({ if: "github.ref == 'refs/heads/main'" }),
        auth({ if: "github.event_name == 'push'" })
      )
    ).toBe(false)
  })

  it.each(['always()', '!cancelled()', 'failure()', 'cancelled()'])(
    'rejects an auth step with if: %s after a guard with no if',
    cond => {
      expect(check(guard(), auth({ if: cond }))).toBe(false)
      expect(check(guard(), auth({ if: `\${{ ${cond} }}` }))).toBe(false)
    }
  )

  it('accepts an auth step with a plain condition after a guard with no if', () => {
    expect(check(guard(), auth({ if: "github.event_name == 'push'" }))).toBe(
      true
    )
    expect(check(guard(), auth({ if: 'success()' }))).toBe(true)
  })

  it('rejects a soft guard whose || condition is not parenthesized in the auth if', () => {
    const cond = "github.ref == 'refs/heads/a' || github.ref == 'refs/heads/b'"
    expect(
      check(
        guard({ if: cond, 'continue-on-error': true }),
        auth({ if: `${cond} && steps.reader.outcome == 'success'` })
      )
    ).toBe(false)
  })

  it('accepts a soft guard whose || condition is parenthesized in the auth if', () => {
    const cond = "github.ref == 'refs/heads/a' || github.ref == 'refs/heads/b'"
    expect(
      check(
        guard({ if: cond, 'continue-on-error': true }),
        auth({ if: `(${cond}) && steps.reader.outcome == 'success'` })
      )
    ).toBe(true)
  })

  it('treats a regex metacharacter in the guard id literally', () => {
    expect(
      check(
        guard({ id: 'r.d', 'continue-on-error': true }),
        auth({ if: "steps.rXd.outcome == 'success'" })
      )
    ).toBe(false)
  })
})

describe('data-reader jobs (#2872 B2)', () => {
  const files = loadWorkflows()
  const wfOf = (file: string) => files.find(f => f.file === file)!.wf

  it('maps the read-only jobs to the data reader', () => {
    expect(EXPECTED['data-pipeline.yml::closing-registry-pr']).toBe(DATA_READER)
    expect(EXPECTED['validate-vs-ceo-report.yml::validate']).toBe(DATA_READER)
  })

  it('uses the preview identity on canary pull requests, data reader otherwise (#2956)', () => {
    expect(EXPECTED['harness-staging-canary.yml::canary']).toBe(
      byEvent('pull_request', PREVIEW, DATA_READER)
    )
  })

  it('maps the preview and cleanup jobs to the preview identity (#2956)', () => {
    expect(EXPECTED['pr-preview.yml::preview']).toBe(PREVIEW)
    expect(EXPECTED['pr-preview-cleanup.yml::cleanup']).toBe(PREVIEW)
  })

  it('checks the preview variable is non-empty before every preview-identity auth step (#2956)', () => {
    const missing: string[] = []
    for (const [key, id] of Object.entries(EXPECTED)) {
      if (id !== PREVIEW) continue
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_PREVIEW_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('checks the preview variable is non-empty before the canary authenticates on pull requests (#2956)', () => {
    const steps = wfOf('harness-staging-canary.yml').jobs!.canary!.steps!
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    const guardAt = steps.findIndex(
      s =>
        /vars\.GCP_PREVIEW_SA/.test(String(Object.values(s.env ?? {}))) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
    expect(steps[guardAt]!.if).toMatch(/github\.event_name == 'pull_request'/)
    // Not soft-failing (#2963). Its if is the same condition the service
    // account expression switches on, so it covers every pull request run.
    expect((steps[guardAt] as GuardStep)['continue-on-error']).toBeUndefined()
  })

  it('checks the pipeline variable is non-empty before every pipeline-identity auth step (#2960)', () => {
    const pipelineJobs = Object.entries(EXPECTED).filter(
      ([, id]) => id === PIPELINE
    )
    expect(pipelineJobs.map(([k]) => k).sort()).toEqual([
      'contact-strip.yml::strip',
      'data-pipeline.yml::daily-reports',
      'data-pipeline.yml::education-ledger-history',
      'data-pipeline.yml::education-rollup',
      'data-pipeline.yml::og-cards',
      'data-pipeline.yml::pipeline',
      'data-pipeline.yml::place-reports',
      'data-pipeline.yml::promote-reports',
      'education-timeline-backfill.yml::backfill',
      'gap-district-prune.yml::prune',
      'legacy-suspension-deadlines.yml::build',
    ])
    const missing: string[] = []
    for (const [key] of pipelineJobs) {
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_PIPELINE_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('checks the restore variable is non-empty before every restore auth step (#2964, #2966)', () => {
    const restoreJobs = Object.entries(EXPECTED).filter(
      ([, id]) => id === RESTORE
    )
    expect(restoreJobs.map(([k]) => k)).toEqual([
      'data-pipeline.yml::data-auto-restore-execute',
      'gcp-identity-smoke.yml::restore',
    ])
    const missing: string[] = []
    for (const [key] of restoreJobs) {
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_RESTORE_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('pairs the restore identity with the data-restore environment, and nothing else uses either (#2964)', () => {
    const envs = collectEnvironments(files)
    const restoreJobs = Object.entries(EXPECTED)
      .filter(([, id]) => id === RESTORE)
      .map(([k]) => k)
    const wrongEnv = restoreJobs.filter(k => envs[k] !== RESTORE_ENVIRONMENT)
    const otherEnvUsers = Object.entries(envs)
      .filter(([, e]) => e === RESTORE_ENVIRONMENT)
      .map(([k]) => k)
      .filter(k => !restoreJobs.includes(k))
    expect(wrongEnv).toEqual([])
    expect(otherEnvUsers).toEqual([])
    expect(restoreJobs).toEqual([
      'data-pipeline.yml::data-auto-restore-execute',
      'gcp-identity-smoke.yml::restore',
    ])
  })

  it('checks the media variable is non-empty before every media auth step (#2972)', () => {
    const mediaJobs = Object.entries(EXPECTED).filter(([, id]) => id === MEDIA)
    expect(mediaJobs.map(([k]) => k).sort()).toEqual([
      'basemap-build.yml::basemap',
      'gcp-identity-smoke.yml::media',
      'videos-publish.yml::publish',
    ])
    const missing: string[] = []
    for (const [key] of mediaJobs) {
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_MEDIA_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('declares no environment on media jobs: the binding is main-only, not environment-scoped (#2972)', () => {
    const envs = collectEnvironments(files)
    const withEnv = Object.entries(EXPECTED)
      .filter(([, id]) => id === MEDIA)
      .map(([k]) => k)
      .filter(k => k in envs)
    expect(withEnv).toEqual([])
  })

  it('maps the production deploy and its smoke job to the hosting-deploy identity (#2984)', () => {
    expect(EXPECTED['deploy.yml::deploy-frontend']).toBe(HOSTING_DEPLOY)
    expect(EXPECTED['gcp-identity-smoke.yml::hosting-deploy']).toBe(
      HOSTING_DEPLOY
    )
  })

  it('checks the hosting-deploy variable is non-empty before every hosting-deploy auth step (#2984)', () => {
    const jobs = Object.entries(EXPECTED).filter(
      ([, id]) => id === HOSTING_DEPLOY
    )
    expect(jobs.map(([k]) => k).sort()).toEqual([
      'deploy.yml::deploy-frontend',
      'gcp-identity-smoke.yml::hosting-deploy',
    ])
    const missing: string[] = []
    for (const [key] of jobs) {
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_HOSTING_DEPLOY_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('pairs the hosting-deploy identity with the production environment, and nothing else uses either (#2984)', () => {
    const envs = collectEnvironments(files)
    const jobs = Object.entries(EXPECTED)
      .filter(([, id]) => id === HOSTING_DEPLOY)
      .map(([k]) => k)
    const wrongEnv = jobs.filter(k => envs[k] !== HOSTING_DEPLOY_ENVIRONMENT)
    const otherEnvUsers = Object.entries(envs)
      .filter(([, e]) => e === HOSTING_DEPLOY_ENVIRONMENT)
      .map(([k]) => k)
      .filter(k => !jobs.includes(k))
    expect(jobs).toHaveLength(2)
    expect(wrongEnv).toEqual([])
    expect(otherEnvUsers).toEqual([])
  })

  it('lets the release-please caller run the deploy job with its environment and token (#2984)', () => {
    // A called workflow's job that declares `environment:` gets that
    // environment's subject claim, so both entry points (workflow_dispatch
    // and this workflow_call) sign in from `production`. The caller must pass
    // the token scope and the repository variables through.
    const caller = wfOf('release-please.yml').jobs!.deploy as unknown as {
      permissions?: Record<string, string>
      secrets?: string
    }
    expect(CALLERS['release-please.yml::deploy']).toBe(
      './.github/workflows/deploy.yml'
    )
    expect(caller.permissions?.['id-token']).toBe('write')
    expect(caller.secrets).toBe('inherit')
    expect(collectEnvironments(files)['deploy.yml::deploy-frontend']).toBe(
      HOSTING_DEPLOY_ENVIRONMENT
    )
  })

  it('builds every identity from known variables only', () => {
    const bad = Object.entries(EXPECTED).filter(
      ([, v]) =>
        !KNOWN_IDENTITIES.some(id => v.includes(id)) ||
        v
          .split(/[\s&|=']+/)
          .filter(t => /^(secrets|vars)\./.test(t))
          .some(t => !KNOWN_IDENTITIES.includes(t))
    )
    expect(bad).toEqual([])
  })

  it('checks the reader variable is non-empty before every data-reader auth step', () => {
    const missing: string[] = []
    for (const [key, id] of Object.entries(EXPECTED)) {
      if (id !== DATA_READER) continue
      const [file, job] = key.split('::')
      const steps = wfOf(file!).jobs![job!]!.steps!
      const authAt = steps.findIndex(s =>
        /google-github-actions\/auth/.test(s.uses ?? '')
      )
      const guarded = hasGuard(steps, authAt, 'GCP_DATA_READER_SA')
      if (!guarded) missing.push(key)
    }
    expect(missing).toEqual([])
  })

  it('exempts only event-conditional canary from the reader guard, with a reason', () => {
    expect(Object.keys(READER_GUARD_EXEMPT)).toEqual([
      'harness-staging-canary.yml::canary',
    ])
    expect(Object.values(READER_GUARD_EXEMPT).every(r => r.trim())).toBe(true)
    const canary = wfOf('harness-staging-canary.yml').jobs!.canary!.steps!.find(
      s => /google-github-actions\/auth/.test(s.uses ?? '')
    )
    expect(canary?.with?.['token_format']).toBe('access_token')
  })

  it('stops the CEO report oracle on any ref but main, before it authenticates', () => {
    const steps = wfOf('validate-vs-ceo-report.yml').jobs!.validate!.steps!
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    const guardAt = steps.findIndex(
      s =>
        /github\.ref\s*!=\s*'refs\/heads\/main'/.test(s.if ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
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
