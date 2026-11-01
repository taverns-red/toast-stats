/**
 * `agent-cli job-log <run|job>` (#2418): the failed step's log, ANSI-free,
 * filtered to error lines plus a short tail.
 *
 * Reads `GET /repos/{repo}/actions/jobs/{id}/logs` through `gh api`, which
 * refuses to print a body containing terminal escape sequences unless
 * `--allow-escape-sequences` is passed — so it always is, and the ANSI is
 * stripped here instead. Flaky API failures (503 ServerBusy, HTTP/2 stream
 * CANCEL) retry with bounded backoff via {@link runGh}.
 *
 * The raw log has no step names, only timestamps, so the failed step is cut
 * out by the step's `started_at`/`completed_at` window (second precision),
 * starting at its `##[group]Run` marker and stopping at the next step's
 * marker or the `Post job cleanup.` line.
 */
import { stripAnsi } from './ansi.js'
import {
  CommandError,
  runGh,
  runGhJson,
  type GhOptions,
  type Runner,
} from './exec.js'

export type JobLogTarget = { kind: 'job' | 'run' | 'id'; id: string }

export function parseJobLogTarget(input: string): JobLogTarget | null {
  const s = input.trim()
  const job = s.match(/\/actions\/runs\/\d+\/job\/(\d+)/)
  if (job) return { kind: 'job', id: job[1] }
  const run = s.match(/\/actions\/runs\/(\d+)/)
  if (run) return { kind: 'run', id: run[1] }
  if (/^\d+$/.test(s)) return { kind: 'id', id: s }
  return null
}

export interface JobStep {
  name: string
  number: number
  status?: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
}

export interface Job {
  id: number
  run_id: number
  name: string
  html_url: string
  status: string
  conclusion: string | null
  workflow_name?: string
  started_at?: string | null
  completed_at?: string | null
  steps: JobStep[]
}

export interface LogLine {
  /** The line's timestamp, or the previous line's for a continuation. */
  ts: string | null
  text: string
  /** True when the raw line carried no timestamp of its own. */
  continued: boolean
}

const TS_PREFIX = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) ?(.*)$/

export function parseLogLines(raw: string): LogLine[] {
  const out: LogLine[] = []
  let last: string | null = null
  const lines = stripAnsi(raw.replace(/^\uFEFF/, '')).split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  for (const line of lines) {
    const m = line.replace(/^\uFEFF/, '').match(TS_PREFIX)
    if (m) {
      last = m[1]
      out.push({ ts: m[1], text: m[2], continued: false })
    } else {
      out.push({ ts: last, text: line, continued: true })
    }
  }
  return out
}

const FAILED = new Set(['failure', 'timed_out', 'cancelled'])

function epoch(ts: string | null): number {
  return ts ? Date.parse(ts) : NaN
}

/** The lines belonging to one step, cut by its time window. */
export function sliceStep(lines: LogLine[], step: JobStep): LogLine[] {
  const start = epoch(step.started_at)
  const end = epoch(step.completed_at) + 1000
  if (Number.isNaN(start) || Number.isNaN(end)) return lines
  const inWindow = (l: LogLine) => {
    const t = epoch(l.ts)
    return t >= start && t < end
  }
  let first = lines.findIndex(inWindow)
  if (first < 0) return []
  const marker = lines.findIndex(
    (l, i) => i >= first && inWindow(l) && l.text.startsWith('##[group]Run ')
  )
  if (marker >= 0) first = marker
  const out: LogLine[] = []
  for (let i = first; i < lines.length; i++) {
    const l = lines[i]
    if (!inWindow(l)) break
    if (i > first && !l.continued && l.text.startsWith('##[group]Run ')) break
    if (!l.continued && l.text === 'Post job cleanup.') break
    out.push(l)
  }
  return out
}

const ERROR_LINE =
  /##\[error\]|\b(error|errors|failed|failure|fatal|exception)\b|AssertionError|\bFAIL\b|✗|×|exit code [1-9]/i

/** Error-ish lines, with each `##[error]` message's continuation lines. */
export function errorLines(lines: LogLine[], max = 80): string[] {
  const out: string[] = []
  let inError = false
  let carried = 0
  for (const l of lines) {
    if (l.continued && inError && carried < 25) {
      out.push(l.text)
      carried++
      continue
    }
    inError = false
    if (l.continued) continue
    if (ERROR_LINE.test(l.text)) {
      out.push(l.text)
      if (l.text.startsWith('##[error]')) {
        inError = true
        carried = 0
      }
    }
  }
  return out.length > max ? out.slice(out.length - max) : out
}

export interface JobLogReport {
  job: {
    id: number
    runId: number
    name: string
    url: string
    workflow: string | null
    conclusion: string | null
  }
  failedSteps: Array<{
    number: number
    name: string
    conclusion: string | null
  }>
  errors: string[]
  tail: string[]
  /** The whole failed-step slice, only with `all`. */
  lines?: string[]
}

export interface ReportOptions {
  all?: boolean
  maxLines?: number
  tailLines?: number
}

export function buildJobReport(
  job: Job,
  rawLog: string,
  opts: ReportOptions
): JobLogReport {
  const lines = parseLogLines(rawLog)
  const failedSteps = job.steps.filter(s => FAILED.has(s.conclusion ?? ''))
  const sliced = failedSteps.length
    ? failedSteps.flatMap(s => sliceStep(lines, s))
    : lines
  const tailN = opts.tailLines ?? 15
  const report: JobLogReport = {
    job: {
      id: job.id,
      runId: job.run_id,
      name: job.name,
      url: job.html_url,
      workflow: job.workflow_name ?? null,
      conclusion: job.conclusion,
    },
    failedSteps: failedSteps.map(s => ({
      number: s.number,
      name: s.name,
      conclusion: s.conclusion,
    })),
    errors: errorLines(sliced, opts.maxLines ?? 80),
    tail: sliced.slice(-tailN).map(l => l.text),
  }
  if (opts.all) report.lines = sliced.map(l => l.text)
  return report
}

export interface JobLogOptions extends ReportOptions {
  repo: string
  runner: Runner
  sleep?: (ms: number) => Promise<void>
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof CommandError && /HTTP 404|Not Found/i.test(err.result.stderr)
  )
}

async function fetchRawLog(
  id: number,
  gh: GhOptions,
  repo: string
): Promise<string> {
  const path = `repos/${repo}/actions/jobs/${id}/logs`
  try {
    return await runGh(['api', '--allow-escape-sequences', path], gh)
  } catch (err) {
    // An older gh has no such flag (and no such refusal): retry without it.
    if (
      err instanceof CommandError &&
      /unknown flag: --allow-escape-sequences/.test(err.result.stderr)
    ) {
      return runGh(['api', path], gh)
    }
    throw err
  }
}

async function failedJobsOfRun(
  runId: string,
  gh: GhOptions,
  repo: string
): Promise<Job[]> {
  const res = await runGhJson<{ jobs: Job[] }>(
    [
      'api',
      `repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    ],
    gh
  )
  const failed = res.jobs.filter(j => FAILED.has(j.conclusion ?? ''))
  if (!failed.length) {
    throw new Error(`run ${runId} has no failed jobs (${res.jobs.length} jobs)`)
  }
  return failed
}

export async function jobLog(
  input: string,
  opts: JobLogOptions
): Promise<JobLogReport[]> {
  const target = parseJobLogTarget(input)
  if (!target) throw new Error(`not a run or job id/URL: ${input}`)
  const gh: GhOptions = { runner: opts.runner, sleep: opts.sleep }
  let jobs: Job[]
  if (target.kind === 'run') {
    jobs = await failedJobsOfRun(target.id, gh, opts.repo)
  } else {
    try {
      jobs = [
        await runGhJson<Job>(
          ['api', `repos/${opts.repo}/actions/jobs/${target.id}`],
          gh
        ),
      ]
    } catch (err) {
      if (target.kind === 'id' && isNotFound(err)) {
        jobs = await failedJobsOfRun(target.id, gh, opts.repo)
      } else throw err
    }
  }
  const reports: JobLogReport[] = []
  for (const job of jobs) {
    const raw = await fetchRawLog(job.id, gh, opts.repo)
    reports.push(buildJobReport(job, raw, opts))
  }
  return reports
}

export function formatJobLog(reports: JobLogReport[]): string {
  const out: string[] = []
  for (const r of reports) {
    const steps = r.failedSteps.map(s => `#${s.number} ${s.name}`).join(', ')
    out.push(
      `== ${r.job.workflow ?? ''} / ${r.job.name} (${r.job.conclusion}) ${r.job.url}`
    )
    out.push(`failed step: ${steps || '(none recorded; whole log)'}`)
    if (r.lines) {
      out.push(...r.lines)
      continue
    }
    out.push('-- errors --')
    out.push(...(r.errors.length ? r.errors : ['(no error lines matched)']))
    out.push('-- tail --')
    out.push(...r.tail)
  }
  return out.join('\n')
}
