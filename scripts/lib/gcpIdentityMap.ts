/**
 * #2872: the job to GCP identity table, plus the workflow parsing helpers the
 * guard tests use. Lives outside the test file so later B-PRs can import and
 * edit it without registering describe blocks.
 *
 * HOW TO UPDATE: each B-PR of #2872 changes the identity variable of the jobs
 * it moves. Edit the value in EXPECTED (key is `<workflow file>::<job id>`) in
 * the same PR as the workflow change.
 *
 * Identity variables seen today:
 * - DATA_READER: `vars.GCP_DATA_READER_SA`, the read-only identity (#2866).
 * - PREVIEW: `vars.GCP_PREVIEW_SA`, the PR preview identity. It lives in the
 *   staging Firebase project, so it can't release to the prod site (#2956).
 * - PIPELINE: `vars.GCP_PIPELINE_SA`, the data pipeline and data-maintenance
 *   identity (#2960). Object access on the staging, prod and raw-private
 *   buckets plus CDN purge; no object restore, bucket metadata or IAM.
 * - RESTORE: `vars.GCP_RESTORE_SA`, the data auto-restore execute identity
 *   (#2964). It signs in only from the `data-restore` environment: object
 *   access on the prod bucket (including restore), read on staging, create
 *   (no overwrite) on the backups bucket, CDN purge; no bucket metadata or IAM.
 * - HOSTING_DEPLOY: `vars.GCP_HOSTING_DEPLOY_SA`, the production Hosting deploy
 *   identity (#2984). It signs in only from the `production` environment and
 *   holds Hosting admin plus service-usage roles at project level; no Cloud
 *   Storage access, so the job writes no bucket object.
 * - MEDIA: `vars.GCP_MEDIA_SA`, the video publish and basemap build identity
 *   (#2972). It signs in from main only and can create (never overwrite or
 *   delete) objects under the `videos/` and `basemap/` prefixes of the staging
 *   and prod data buckets, and read objects under those prefixes on staging.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

export const DATA_READER = 'vars.GCP_DATA_READER_SA'
export const PREVIEW = 'vars.GCP_PREVIEW_SA'
export const PIPELINE = 'vars.GCP_PIPELINE_SA'
export const RESTORE = 'vars.GCP_RESTORE_SA'
export const MEDIA = 'vars.GCP_MEDIA_SA'
export const HOSTING_DEPLOY = 'vars.GCP_HOSTING_DEPLOY_SA'

/** The one environment the restore identity's WIF binding admits (#2964). */
export const RESTORE_ENVIRONMENT = 'data-restore'

/** The one environment the hosting-deploy identity's binding admits (#2984). */
export const HOSTING_DEPLOY_ENVIRONMENT = 'production'

/**
 * An identity chosen by event: `<event>` runs use `whenEvent`, every other
 * event uses `otherwise`. Written as the exact expression the workflow's
 * `service_account:` carries, so the map compares it verbatim (#2872 B2).
 *
 * The `otherwise` branch must never be the more privileged identity: an empty
 * `whenEvent` secret falls through to it.
 */
export const byEvent = (
  event: string,
  whenEvent: string,
  otherwise: string
): string => `github.event_name == '${event}' && ${whenEvent} || ${otherwise}`

/**
 * Jobs that use the data reader without the non-empty variable guard step,
 * with the reason. The auth action given an empty service account falls back
 * to direct workload identity, so every other data-reader job needs the guard.
 */
export const READER_GUARD_EXEMPT: Record<string, string> = {
  'harness-staging-canary.yml::canary':
    'asks for token_format access_token, which fails on an empty service account',
}

/** The identity variables an EXPECTED value may be built from. */
export const KNOWN_IDENTITIES = [
  DATA_READER,
  PREVIEW,
  PIPELINE,
  RESTORE,
  MEDIA,
  HOSTING_DEPLOY,
]

/** Every job that runs google-github-actions/auth -> its one identity. */
export const EXPECTED: Record<string, string> = {
  'basemap-build.yml::basemap': MEDIA,
  'contact-strip.yml::strip': PIPELINE,
  'data-pipeline.yml::pipeline': PIPELINE,
  'data-pipeline.yml::closing-registry-pr': DATA_READER,
  'data-pipeline.yml::daily-reports': PIPELINE,
  'data-pipeline.yml::place-reports': PIPELINE,
  'data-pipeline.yml::education-rollup': PIPELINE,
  'data-pipeline.yml::promote-reports': PIPELINE,
  'data-pipeline.yml::data-auto-restore-decide': DATA_READER,
  'data-pipeline.yml::data-auto-restore-execute': RESTORE,
  'data-pipeline.yml::og-cards': PIPELINE,
  'data-pipeline.yml::education-ledger-history': PIPELINE,
  'deploy.yml::deploy-frontend': HOSTING_DEPLOY,
  'education-timeline-backfill.yml::backfill': PIPELINE,
  'gap-district-prune.yml::prune': PIPELINE,
  'gcp-identity-smoke.yml::hosting-deploy': HOSTING_DEPLOY,
  'gcp-identity-smoke.yml::media': MEDIA,
  'gcp-identity-smoke.yml::restore': RESTORE,
  'harness-staging-canary.yml::canary': byEvent(
    'pull_request',
    PREVIEW,
    DATA_READER
  ),
  'pr-preview-cleanup.yml::cleanup': PREVIEW,
  'pr-preview.yml::preview': PREVIEW,
  'validate-vs-ceo-report.yml::validate': DATA_READER,
  'videos-publish.yml::publish': MEDIA,
}

/**
 * Jobs that can mint a GitHub OIDC token (effective `id-token: write`) but do
 * not run the GCP auth action. The WIF binding admits any job with id-token on
 * this repo, so id-token is the real capability. One reason per entry.
 */
export const NON_GCP_OIDC: Record<string, string> = {
  'release-please.yml::deploy':
    'reusable-workflow caller; id-token is passed through to deploy.yml',
}

/**
 * Job-level `uses:` (reusable workflow calls): caller job -> full `uses` string.
 * deploy.yml has two entry points: workflow_dispatch and workflow_call from
 * release-please. The hosting-deploy identity admits the `production`
 * environment, which the called job declares, so both sign in with the same
 * subject (#2984).
 */
export const CALLERS: Record<string, string> = {
  'release-please.yml::deploy': './.github/workflows/deploy.yml',
}

/** Patterns that must never appear in a workflow (static or key credentials). */
export const FORBIDDEN_CREDENTIAL_PATTERNS: RegExp[] = [
  /credentials_json/,
  /activate-service-account/,
  /--cred-file/,
  /\bGOOGLE_APPLICATION_CREDENTIALS\b/,
  /\bGOOGLE_GHA_CREDS_PATH\b/,
  /\bCLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE\b/,
]

const WORKFLOWS = path.resolve(process.cwd(), '.github/workflows')
const AUTH_ACTION = /^google-github-actions\/auth(@|$)/

interface Step {
  if?: string
  run?: string
  env?: Record<string, unknown>
  uses?: string
  with?: Record<string, unknown>
}
type Permissions = string | Record<string, string> | undefined
interface Job {
  uses?: string
  environment?: string | { name?: string }
  permissions?: Permissions
  steps?: Step[]
}
interface Workflow {
  permissions?: Permissions
  jobs?: Record<string, Job>
}

export interface WorkflowFile {
  file: string
  text: string
  wf: Workflow
}

export const loadWorkflows = (): WorkflowFile[] =>
  fs
    .readdirSync(WORKFLOWS)
    .sort()
    .filter(f => /\.ya?ml$/.test(f))
    .map(file => {
      const text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf-8')
      return { file, text, wf: parse(text) as Workflow }
    })

/** `${{ secrets.X }}` or `${{ vars.X }}` -> `secrets.X` / `vars.X`. */
export const identityOf = (v: unknown): string => {
  const m = /^\s*\$\{\{\s*(.*?)\s*\}\}\s*$/.exec(String(v ?? ''))
  return m ? m[1] : String(v ?? '<missing>')
}

/** key `<file>::<job>` -> set of service_account values used by auth steps. */
export const collectAuthJobs = (
  files: WorkflowFile[]
): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>()
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      for (const step of def.steps ?? []) {
        if (!step.uses || !AUTH_ACTION.test(step.uses)) continue
        const key = `${file}::${job}`
        const set = out.get(key) ?? new Set<string>()
        set.add(identityOf(step.with?.service_account))
        out.set(key, set)
      }
    }
  }
  return out
}

const grantsIdToken = (p: Permissions): boolean =>
  p === 'write-all' ||
  (typeof p === 'object' && p !== null && p['id-token'] === 'write')

/**
 * Jobs whose effective permissions include `id-token: write`: the job's own
 * block, or the workflow-level block when the job declares none.
 */
export const collectIdTokenJobs = (files: WorkflowFile[]): string[] => {
  const out: string[] = []
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      const effective =
        def.permissions !== undefined ? def.permissions : wf.permissions
      if (grantsIdToken(effective)) out.push(`${file}::${job}`)
    }
  }
  return out
}

/** key `<file>::<job>` -> the environment name, for every job that declares one. */
export const collectEnvironments = (
  files: WorkflowFile[]
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      const env =
        typeof def.environment === 'string'
          ? def.environment
          : def.environment?.name
      if (env) out[`${file}::${job}`] = env
    }
  }
  return out
}

/** key `<file>::<job>` -> the full `uses:` string, for every job-level `uses:`. */
export const collectCallers = (
  files: WorkflowFile[]
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      if (def.uses) out[`${file}::${job}`] = def.uses
    }
  }
  return out
}

/**
 * Every step-level `uses: ./...` (a local composite action could hide an auth
 * step from the scan above). Job-level reusable-workflow calls are covered by
 * CALLERS instead.
 */
export const collectLocalUses = (files: WorkflowFile[]): string[] => {
  const out: string[] = []
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      for (const step of def.steps ?? []) {
        if (step.uses?.startsWith('./'))
          out.push(`${file}::${job}::${step.uses}`)
      }
    }
  }
  return out
}

/** `<file>: <pattern>` for each forbidden credential pattern found. */
export const findForbiddenCredentials = (files: WorkflowFile[]): string[] =>
  files.flatMap(({ file, text }) =>
    FORBIDDEN_CREDENTIAL_PATTERNS.filter(re => re.test(text)).map(
      re => `${file}: ${re.source}`
    )
  )
