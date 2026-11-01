/**
 * `agent-cli main-status` (#2418): is the newest commit on main green, red
 * or pending — and if red, which workflow, job and step failed. Read-only:
 * `gh api commits/main`, `gh run list --commit`, `gh run view --json jobs`.
 *
 * Only the newest run of each workflow on that commit counts, so a scheduled
 * workflow that failed and then passed reads green. Red outranks pending:
 * a known failure is reported even while other workflows are still running.
 */
import { runGhJson, type Runner } from './exec.js'

export interface RunSummary {
  databaseId: number
  workflowName: string
  status: string
  conclusion: string
  event: string
  url: string
  createdAt: string
  displayTitle?: string
}

export const RUN_FIELDS =
  'databaseId,workflowName,status,conclusion,event,url,createdAt,displayTitle'

const RED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure'])

export type MainState = 'green' | 'red' | 'pending'

export function latestPerWorkflow(runs: RunSummary[]): RunSummary[] {
  const latest = new Map<string, RunSummary>()
  for (const r of runs) {
    const prev = latest.get(r.workflowName)
    if (!prev || r.createdAt > prev.createdAt) latest.set(r.workflowName, r)
  }
  return [...latest.values()].sort((a, b) =>
    a.workflowName.localeCompare(b.workflowName)
  )
}

function isPending(r: RunSummary): boolean {
  return r.status !== 'completed' || r.conclusion === 'action_required'
}

export function classifyMain(runs: RunSummary[]): {
  state: MainState
  latest: RunSummary[]
  failing: RunSummary[]
  pending: RunSummary[]
} {
  const latest = latestPerWorkflow(runs)
  const failing = latest.filter(
    r => r.status === 'completed' && RED_CONCLUSIONS.has(r.conclusion)
  )
  const pending = latest.filter(isPending)
  const state: MainState = failing.length
    ? 'red'
    : pending.length || latest.length === 0
      ? 'pending'
      : 'green'
  return { state, latest, failing, pending }
}

export interface FailedJob {
  name: string
  url: string
  failedSteps: string[]
}

interface RunViewJobs {
  jobs: Array<{
    name: string
    conclusion: string
    url: string
    steps?: Array<{ name: string; conclusion: string }>
  }>
}

export function failedJobsFromRunView(view: RunViewJobs): FailedJob[] {
  return view.jobs
    .filter(j => RED_CONCLUSIONS.has(j.conclusion))
    .map(j => ({
      name: j.name,
      url: j.url,
      failedSteps: (j.steps ?? [])
        .filter(s => RED_CONCLUSIONS.has(s.conclusion))
        .map(s => s.name),
    }))
}

export interface WorkflowStatus extends RunSummary {
  failedJobs?: FailedJob[]
}

export interface MainStatusReport {
  branch: string
  sha: string
  shortSha: string
  title: string
  committedAt: string
  state: MainState
  workflows: WorkflowStatus[]
}

export interface MainStatusOptions {
  repo: string
  runner: Runner
  sleep?: (ms: number) => Promise<void>
  branch?: string
}

export async function mainStatus(
  opts: MainStatusOptions
): Promise<MainStatusReport> {
  const branch = opts.branch ?? 'main'
  const gh = { runner: opts.runner, sleep: opts.sleep }
  const head = await runGhJson<{ sha: string; message: string; date: string }>(
    [
      'api',
      `repos/${opts.repo}/commits/${branch}`,
      '--jq',
      '{sha: .sha, message: .commit.message, date: .commit.committer.date}',
    ],
    gh
  )
  const runs = await runGhJson<RunSummary[]>(
    [
      'run',
      'list',
      '--repo',
      opts.repo,
      '--branch',
      branch,
      '--commit',
      head.sha,
      '--limit',
      '100',
      '--json',
      RUN_FIELDS,
    ],
    gh
  )
  const c = classifyMain(runs)
  const failingIds = new Set(c.failing.map(r => r.databaseId))
  const workflows: WorkflowStatus[] = []
  for (const r of c.latest) {
    if (!failingIds.has(r.databaseId)) {
      workflows.push(r)
      continue
    }
    const view = await runGhJson<RunViewJobs>(
      [
        'run',
        'view',
        String(r.databaseId),
        '--repo',
        opts.repo,
        '--json',
        'jobs',
      ],
      gh
    )
    workflows.push({ ...r, failedJobs: failedJobsFromRunView(view) })
  }
  return {
    branch,
    sha: head.sha,
    shortSha: head.sha.slice(0, 7),
    title: head.message.split('\n')[0],
    committedAt: head.date,
    state: c.state,
    workflows,
  }
}

export function mainStatusExitCode(r: MainStatusReport): number {
  return r.state === 'green' ? 0 : r.state === 'red' ? 1 : 2
}

const ICON: Record<string, string> = {
  success: '✓',
  failure: '✗',
  timed_out: '✗',
  startup_failure: '✗',
  cancelled: '⊘',
  skipped: '-',
}

export function formatMainStatus(r: MainStatusReport): string {
  const out = [
    `${r.branch} ${r.shortSha} ${r.state} — ${r.title} (${r.committedAt})`,
  ]
  if (!r.workflows.length) out.push('  (no workflow runs on this commit yet)')
  for (const w of r.workflows) {
    const verdict = w.status === 'completed' ? w.conclusion : w.status
    const icon = w.status === 'completed' ? (ICON[w.conclusion] ?? '?') : '…'
    out.push(`  ${icon} ${w.workflowName} [${w.event}] ${verdict} ${w.url}`)
    for (const j of w.failedJobs ?? []) {
      out.push(
        `      ✗ job ${j.name}: ${j.failedSteps.join(', ') || '(no failed step)'} ${j.url}`
      )
    }
  }
  return out.join('\n')
}
