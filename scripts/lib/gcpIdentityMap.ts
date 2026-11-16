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
 * - DEPLOYER: `secrets.GCP_SERVICE_ACCOUNT`, the single shared deploy identity.
 * - DATA_READER: `vars.GCP_DATA_READER_SA`, the read-only identity (#2866).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

export const DEPLOYER = 'secrets.GCP_SERVICE_ACCOUNT'
export const DATA_READER = 'vars.GCP_DATA_READER_SA'

/** Every job that runs google-github-actions/auth -> its one identity. */
export const EXPECTED: Record<string, string> = {}

/**
 * Jobs that can mint a GitHub OIDC token (effective `id-token: write`) but do
 * not run the GCP auth action. The WIF binding admits any job with id-token on
 * this repo, so id-token is the real capability. One reason per entry.
 */
export const NON_GCP_OIDC: Record<string, string> = {}

/**
 * Job-level `uses:` (reusable workflow calls): caller job -> callee file.
 * B6 (hosting-deploy) must handle BOTH deploy.yml entry points:
 * workflow_dispatch and workflow_call from release-please.
 */
export const CALLERS: Record<string, string> = {}

/** Patterns that must never appear in a workflow (static or key credentials). */
export const FORBIDDEN_CREDENTIAL_PATTERNS: RegExp[] = [
  /credentials_json/,
  /activate-service-account/,
  /--cred-file/,
  /GOOGLE_APPLICATION_CREDENTIALS:/,
]

const WORKFLOWS = path.resolve(process.cwd(), '.github/workflows')
const AUTH_ACTION = /^google-github-actions\/auth(@|$)/

interface Step {
  uses?: string
  with?: Record<string, unknown>
}
type Permissions = string | Record<string, string> | undefined
interface Job {
  uses?: string
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

/** key `<file>::<job>` -> callee, for every job-level `uses:`. */
export const collectCallers = (
  files: WorkflowFile[]
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const { file, wf } of files) {
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      if (def.uses) out[`${file}::${job}`] = path.basename(def.uses)
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
