/**
 * agent-cli dispatcher (#2418). `./bin/agent-cli <subcommand> [options]`.
 *
 * Answers the questions sessions in this repo keep re-asking (measured in
 * taverns-red/ops#148): is CI done, is main green, what failed, what is live,
 * where is the preview, which worktrees can go. Every subcommand is
 * READ-ONLY or WAIT-ONLY. Merging, approving runs, dispatching workflows,
 * releasing and GCS/prod writes are deliberately absent: they need Ron's
 * per-action approval.
 *
 * Output: human text on stdout, or one JSON document with --json. Progress
 * and retry notes go to stderr (R4).
 *
 * Exit codes: 0 ok/green/pass · 1 failed/red/broken/not found ·
 * 2 pending/timed out · 3 usage or tool error.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { realRunner, type Runner } from './exec.js'
import { ciWait, ciWaitExitCode, formatCiWait } from './ciWait.js'
import { formatJobLog, jobLog } from './jobLog.js'
import {
  formatLiveVersion,
  LIVE_URL,
  liveVersion,
  type Fetcher,
} from './liveVersion.js'
import {
  formatMainStatus,
  mainStatus,
  mainStatusExitCode,
} from './mainStatus.js'
import { formatPreview, previewUrl } from './previewUrl.js'
import { auditWorktrees, formatWorktreeAudit } from './worktreeAudit.js'

export const DEFAULT_REPO = 'taverns-red/toast-stats'

export interface CliDeps {
  runner: Runner
  sleep: (ms: number) => Promise<void>
  now: () => number
  fetcher: Fetcher
  stdout: (s: string) => void
  stderr: (s: string) => void
  cwd: string
}

type Options = NonNullable<ParseArgsConfig['options']>
type Values = Record<string, string | boolean | undefined>

interface Subcommand {
  summary: string
  usage: string
  help: string
  options: Options
  run: (
    pos: string[],
    v: Values,
    deps: CliDeps,
    repo: string
  ) => Promise<{ code: number; json: unknown; text: string }>
}

const COMMON: Options = {
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  repo: { type: 'string' },
}

const COMMON_HELP = `Common options:
  --json           Print one JSON document on stdout instead of text
  --repo <o/r>     Repository (default ${DEFAULT_REPO})
  -h, --help       Show this help`

function prNumber(s: string | undefined): number {
  if (!s || !/^\d+$/.test(s))
    throw new UsageError(`expected a PR number, got ${s ?? 'nothing'}`)
  return Number(s)
}

function seconds(
  v: string | boolean | undefined,
  def: number,
  name: string
): number {
  if (v === undefined) return def
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0)
    throw new UsageError(`--${name} must be a number of seconds`)
  return n * 1000
}

class UsageError extends Error {}

function repoVersion(cwd: string): string | null {
  try {
    return (
      (
        JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
          version?: string
        }
      ).version ?? null
    )
  } catch {
    return null
  }
}

export const SUBCOMMANDS: Record<string, Subcommand> = {
  'ci-wait': {
    summary: "Wait for a PR's checks to finish; print only failures",
    usage:
      'agent-cli ci-wait <pr> [--interval 30] [--timeout 3600] [--once] [--fail-fast] [--allow-cancelled] [--json]',
    help: `Polls \`gh pr checks <pr>\` until no check is pending, then prints only the
failed (and cancelled) checks with their job links. Use instead of hand-written
sleep/gh pr checks loops. Wait-only: never re-runs, approves or merges.

Options:
  --interval <s>     Seconds between polls (default 30)
  --timeout <s>      Give up after this many seconds (default 3600)
  --once             Evaluate the current state once; don't wait
  --fail-fast        Return as soon as any check fails
  --allow-cancelled  Don't count a cancelled check as a failure

Exit: 0 all passed · 1 a check failed or was cancelled · 2 still pending at timeout/--once`,
    options: {
      interval: { type: 'string' },
      timeout: { type: 'string' },
      once: { type: 'boolean' },
      'fail-fast': { type: 'boolean' },
      'allow-cancelled': { type: 'boolean' },
    },
    async run(pos, v, deps, repo) {
      const pr = prNumber(pos[0])
      let last = ''
      const r = await ciWait(pr, {
        repo,
        runner: deps.runner,
        sleep: deps.sleep,
        now: deps.now,
        intervalMs: seconds(v.interval, 30, 'interval'),
        timeoutMs: seconds(v.timeout, 3600, 'timeout'),
        once: v.once === true,
        failFast: v['fail-fast'] === true,
        allowCancelled: v['allow-cancelled'] === true,
        onProgress: s => {
          const msg = `PR #${pr}: ${s.passed} passed, ${s.failed} failed, ${s.pending} pending`
          if (msg !== last) deps.stderr(msg)
          last = msg
        },
      })
      return { code: ciWaitExitCode(r), json: r, text: formatCiWait(r) }
    },
  },
  'main-status': {
    summary: 'Is the latest main commit green, red or pending?',
    usage: 'agent-cli main-status [--branch main] [--json]',
    help: `Reads the newest commit on main and the newest run of each workflow on it.
Red names the failing workflow, job and step. Red outranks pending.

Options:
  --branch <b>   Branch to check (default main)

Exit: 0 green · 1 red · 2 pending (or no runs yet)`,
    options: { branch: { type: 'string' } },
    async run(_pos, v, deps, repo) {
      const r = await mainStatus({
        repo,
        runner: deps.runner,
        sleep: deps.sleep,
        branch: typeof v.branch === 'string' ? v.branch : 'main',
      })
      return { code: mainStatusExitCode(r), json: r, text: formatMainStatus(r) }
    },
  },
  'job-log': {
    summary: 'Failed-step log of a run or job: ANSI-free, filtered to errors',
    usage:
      'agent-cli job-log <run-id|job-id|run/job URL> [--all] [--max-lines 80] [--tail 15] [--json]',
    help: `Fetches the job log via \`gh api --allow-escape-sequences .../actions/jobs/<id>/logs\`,
cuts it to the failed step(s), strips ANSI codes and prints the error lines plus
a short tail. A run id/URL expands to that run's failed jobs. Retries the flaky
GitHub API failures seen here (HTTP 503 ServerBusy, "stream error: stream ID 1;
CANCEL", resets) with bounded backoff (5 tries: 1+2+4+8 s).

Options:
  --all            Print the whole failed-step log, not just error lines
  --max-lines <n>  Cap on error lines (default 80)
  --tail <n>       Tail lines of the failed step (default 15)

Exit: 0 printed · 3 not found / API error`,
    options: {
      all: { type: 'boolean' },
      'max-lines': { type: 'string' },
      tail: { type: 'string' },
    },
    async run(pos, v, deps, repo) {
      if (!pos[0]) throw new UsageError('expected a run or job id/URL')
      const reports = await jobLog(pos[0], {
        repo,
        runner: deps.runner,
        sleep: deps.sleep,
        all: v.all === true,
        maxLines: v['max-lines'] ? Number(v['max-lines']) : undefined,
        tailLines: v.tail ? Number(v.tail) : undefined,
      })
      return { code: 0, json: reports, text: formatJobLog(reports) }
    },
  },
  'live-version': {
    summary:
      'Version the live site (or a PR preview) serves, plus asset probes',
    usage: 'agent-cli live-version [--preview <pr>] [--url <base>] [--json]',
    help: `Fetches index.html from ${LIVE_URL} (or the PR's preview channel), reads
VITE_APP_VERSION from the entry bundle, and probes every /assets/* file the page
references (a 404 or an HTML body is broken). Preview builds carry no version, so
they report version null and are identified by the entry-bundle hash.

Options:
  --preview <pr>   Check the PR's preview channel instead of production
  --url <base>     Check an arbitrary base URL

Exit: 0 ok · 1 a referenced asset is broken, or no preview found`,
    options: { preview: { type: 'string' }, url: { type: 'string' } },
    async run(_pos, v, deps, repo) {
      let base = typeof v.url === 'string' ? v.url : LIVE_URL
      if (typeof v.preview === 'string') {
        const p = await previewUrl(prNumber(v.preview), {
          repo,
          runner: deps.runner,
          sleep: deps.sleep,
          now: deps.now,
        })
        if (!p || !p.live) {
          return {
            code: 1,
            json: { error: `no live preview for PR #${v.preview}`, preview: p },
            text: `no live preview for PR #${v.preview}${p ? ` (${formatPreview(p)})` : ''}`,
          }
        }
        base = p.url
      }
      const r = await liveVersion({
        base,
        fetcher: deps.fetcher,
        sleep: deps.sleep,
        repoVersion: repoVersion(deps.cwd),
      })
      return {
        code: r.broken.length ? 1 : 0,
        json: r,
        text: formatLiveVersion(r),
      }
    },
  },
  'preview-url': {
    summary: "A PR's Firebase preview channel URL",
    usage: 'agent-cli preview-url <pr> [--json]',
    help: `Reads the sticky "Preview deployed" comment that pr-preview.yml posts and
prints the channel URL and its expiry.

Exit: 0 live · 1 no preview comment, the channel expired, or the PR is closed
(pr-preview-cleanup.yml deletes the channel when the PR closes)`,
    options: {},
    async run(pos, _v, deps, repo) {
      const pr = prNumber(pos[0])
      const p = await previewUrl(pr, {
        repo,
        runner: deps.runner,
        sleep: deps.sleep,
        now: deps.now,
      })
      if (!p)
        return {
          code: 1,
          json: { pr, url: null },
          text: `no preview comment on PR #${pr}`,
        }
      return { code: p.live ? 0 : 1, json: p, text: formatPreview(p) }
    },
  },
  'worktree-audit': {
    summary: 'Which worktrees are dirty, unpushed, or safe to remove',
    usage: 'agent-cli worktree-audit [--json]',
    help: `For each \`git worktree\`: dirty state, commits ahead of upstream, and whether
the local tip is contained in a MERGED PR's head (fetched from pull/N/head when
missing — origin/<b>..<b> reads 0 once the remote branch is deleted). SAFE only
when clean, not primary/locked, and the tip is in the merged PR head. Read-only:
it removes nothing.

Exit: 0 always (the verdicts are in the output)`,
    options: {},
    async run(_pos, _v, deps, repo) {
      const a = await auditWorktrees({
        repo,
        runner: deps.runner,
        sleep: deps.sleep,
        cwd: deps.cwd,
      })
      return { code: 0, json: a, text: formatWorktreeAudit(a) }
    },
  },
}

function topHelp(): string {
  const width = Math.max(...Object.keys(SUBCOMMANDS).map(k => k.length))
  const rows = Object.entries(SUBCOMMANDS).map(
    ([k, s]) => `  ${k.padEnd(width)}  ${s.summary}`
  )
  return `agent-cli — answers for agent sessions in this repo (#2418)

Usage: ./bin/agent-cli <subcommand> [options]

Subcommands (all read-only or wait-only):
${rows.join('\n')}

Every subcommand takes --help and --json. Nothing here merges, approves runs,
dispatches workflows, releases, or writes to GCS or prod.

Exit codes: 0 ok/green/pass · 1 failed/red/broken · 2 pending/timed out ·
3 usage or tool error.`
}

export async function main(
  argv: string[],
  partial: Partial<CliDeps> = {}
): Promise<number> {
  const deps: CliDeps = {
    runner: realRunner,
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    now: Date.now,
    fetcher: (url, init) => fetch(url, init),
    stdout: s => process.stdout.write(s.endsWith('\n') ? s : `${s}\n`),
    stderr: s => process.stderr.write(s.endsWith('\n') ? s : `${s}\n`),
    cwd: process.cwd(),
    ...partial,
  }
  const [name, ...rest] = argv
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    deps.stdout(topHelp())
    return name ? 0 : 3
  }
  const sub = SUBCOMMANDS[name]
  if (!sub) {
    deps.stderr(
      `agent-cli: unknown subcommand '${name}'. Run ./bin/agent-cli --help`
    )
    return 3
  }
  let json = rest.includes('--json')
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { ...COMMON, ...sub.options },
      allowPositionals: true,
      strict: true,
    })
    json = values.json === true
    if (values.help) {
      deps.stdout(
        `Usage: ${sub.usage}\n\n${sub.summary}.\n\n${sub.help}\n\n${COMMON_HELP}`
      )
      return 0
    }
    const repo = typeof values.repo === 'string' ? values.repo : DEFAULT_REPO
    const r = await sub.run(positionals, values as Values, deps, repo)
    deps.stdout(json ? JSON.stringify(r.json, null, 2) : r.text)
    return r.code
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const usage =
      err instanceof UsageError ||
      (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')
    deps.stderr(
      `agent-cli ${name}: ${msg}${usage ? `\nUsage: ${sub.usage}` : ''}`
    )
    if (json) deps.stdout(JSON.stringify({ error: msg }))
    return 3
  }
}
