/**
 * `agent-cli worktree-audit` (#2418): for each git worktree — is it dirty,
 * does it have unpushed commits, and is its local tip contained in the
 * merged PR's head?
 *
 * A worktree is reported SAFE to remove only when it is clean, not the
 * primary checkout, not locked, and its HEAD is an ancestor of (or equal to)
 * the head commit of a MERGED PR for its branch. That head is fetched from
 * `refs/pull/N/head` when it isn't local, because the usual check
 * `origin/<b>..<b>` reads 0 once the remote branch is deleted on merge and
 * then proves nothing.
 *
 * Read-only: the only write is `git fetch --no-write-fetch-head` of a PR
 * head into the object store. It never removes, prunes, resets or pushes.
 */
import { runGhJson, runGit, type Runner } from './exec.js'

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  detached: boolean
  bare: boolean
  locked: boolean
  prunable: boolean
}

export function parseWorktreePorcelain(text: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean)
    if (!lines.length || !lines[0].startsWith('worktree ')) continue
    const e: WorktreeEntry = {
      path: lines[0].slice('worktree '.length),
      head: '',
      branch: null,
      detached: false,
      bare: false,
      locked: false,
      prunable: false,
    }
    for (const l of lines.slice(1)) {
      if (l.startsWith('HEAD ')) e.head = l.slice(5)
      else if (l.startsWith('branch '))
        e.branch = l.slice(7).replace(/^refs\/heads\//, '')
      else if (l === 'detached') e.detached = true
      else if (l === 'bare') e.bare = true
      else if (l === 'locked' || l.startsWith('locked ')) e.locked = true
      else if (l === 'prunable' || l.startsWith('prunable ')) e.prunable = true
    }
    out.push(e)
  }
  return out
}

interface PrRow {
  number: number
  state: string
  headRefOid: string
  mergedAt: string | null
  url: string
}

export interface WorktreeAudit {
  path: string
  branch: string | null
  head: string
  primary: boolean
  locked: boolean
  prunable: boolean
  /** null when the path is gone (prunable) and status can't be read. */
  dirty: boolean | null
  dirtyFiles: number
  untracked: number
  upstream: string | null
  remoteBranchExists: boolean
  /** Commits on HEAD not on its upstream; null without a live upstream. */
  ahead: number | null
  pr: { number: number; state: string; url: string } | null
  /** null when there is no merged PR to compare against. */
  tipInMergedPrHead: boolean | null
  safeToRemove: boolean
  reasons: string[]
}

export interface AuditOptions {
  repo: string
  runner: Runner
  sleep?: (ms: number) => Promise<void>
  cwd?: string
}

async function readDirty(
  runner: Runner,
  path: string
): Promise<{ dirty: boolean | null; dirtyFiles: number; untracked: number }> {
  const r = await runGit(runner, ['-C', path, 'status', '--porcelain=v1'])
  if (r.code !== 0) return { dirty: null, dirtyFiles: 0, untracked: 0 }
  const lines = r.stdout.split('\n').filter(Boolean)
  const untracked = lines.filter(l => l.startsWith('??')).length
  return {
    dirty: lines.length > 0,
    dirtyFiles: lines.length - untracked,
    untracked,
  }
}

async function readUpstream(
  runner: Runner,
  path: string
): Promise<{ upstream: string | null; ahead: number | null }> {
  const u = await runGit(runner, [
    '-C',
    path,
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{u}',
  ])
  if (u.code !== 0) return { upstream: null, ahead: null }
  const c = await runGit(runner, [
    '-C',
    path,
    'rev-list',
    '--count',
    '@{u}..HEAD',
  ])
  return {
    upstream: u.stdout.trim(),
    ahead: c.code === 0 ? Number(c.stdout.trim()) : null,
  }
}

/** Is `tip` contained in the PR's head commit? Fetches pull/N/head if needed. */
async function tipInPrHead(
  runner: Runner,
  cwd: string | undefined,
  tip: string,
  pr: PrRow
): Promise<boolean> {
  const have = await runGit(
    runner,
    ['cat-file', '-e', `${pr.headRefOid}^{commit}`],
    cwd
  )
  if (have.code !== 0) {
    await runGit(
      runner,
      [
        'fetch',
        '--no-write-fetch-head',
        '--quiet',
        'origin',
        `refs/pull/${pr.number}/head`,
      ],
      cwd
    )
  }
  const anc = await runGit(
    runner,
    ['merge-base', '--is-ancestor', tip, pr.headRefOid],
    cwd
  )
  return anc.code === 0
}

export async function auditWorktrees(
  opts: AuditOptions
): Promise<WorktreeAudit[]> {
  const { runner, cwd } = opts
  const list = await runGit(runner, ['worktree', 'list', '--porcelain'], cwd)
  if (list.code !== 0)
    throw new Error(`git worktree list failed: ${list.stderr.trim()}`)
  const entries = parseWorktreePorcelain(list.stdout)
  const out: WorktreeAudit[] = []
  for (const [i, e] of entries.entries()) {
    if (e.bare) continue
    const primary = i === 0
    const reasons: string[] = []
    const d = e.prunable
      ? { dirty: null, dirtyFiles: 0, untracked: 0 }
      : await readDirty(runner, e.path)
    const up =
      e.branch && !e.prunable
        ? await readUpstream(runner, e.path)
        : { upstream: null, ahead: null }
    let remoteBranchExists = false
    let pr: WorktreeAudit['pr'] = null
    let contained: boolean | null = null

    if (e.branch) {
      const ref = await runGit(
        runner,
        ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${e.branch}`],
        cwd
      )
      remoteBranchExists = ref.code === 0
    }

    if (primary) reasons.push('primary worktree')
    else if (!e.branch)
      reasons.push('detached HEAD: no branch to match to a PR')
    else {
      const rows = await runGhJson<PrRow[]>(
        [
          'pr',
          'list',
          '--repo',
          opts.repo,
          '--head',
          e.branch,
          '--state',
          'all',
          '--json',
          'number,state,headRefOid,mergedAt,url',
          '--limit',
          '20',
        ],
        { runner, sleep: opts.sleep }
      )
      const merged = rows
        .filter(r => r.state === 'MERGED')
        .sort((a, b) => (b.mergedAt ?? '').localeCompare(a.mergedAt ?? ''))
      const shown = merged[0] ?? rows[0]
      if (shown)
        pr = { number: shown.number, state: shown.state, url: shown.url }
      if (!merged.length) {
        reasons.push(
          shown
            ? `PR #${shown.number} is ${shown.state}, not merged`
            : 'no PR for this branch'
        )
      } else {
        contained = false
        for (const m of merged) {
          if (await tipInPrHead(runner, cwd, e.head, m)) {
            contained = true
            pr = { number: m.number, state: m.state, url: m.url }
            break
          }
        }
        if (!contained) {
          reasons.push(
            `local tip ${e.head.slice(0, 7)} is not contained in merged PR #${merged[0].number} head ${merged[0].headRefOid.slice(0, 7)} (unmerged local commits)`
          )
        }
      }
    }
    if (d.dirty === true)
      reasons.push(`dirty: ${d.dirtyFiles} modified, ${d.untracked} untracked`)
    if (d.dirty === null) reasons.push('status unreadable (path missing?)')
    if (e.locked) reasons.push('locked')
    if (e.prunable) reasons.push('prunable: worktree path is gone')

    const safe =
      !primary && !e.locked && d.dirty === false && contained === true
    if (safe && pr)
      reasons.unshift(
        `clean; tip ${e.head.slice(0, 7)} is in merged PR #${pr.number} head`
      )
    out.push({
      path: e.path,
      branch: e.branch,
      head: e.head,
      primary,
      locked: e.locked,
      prunable: e.prunable,
      ...d,
      ...up,
      remoteBranchExists,
      pr,
      tipInMergedPrHead: contained,
      safeToRemove: safe,
      reasons,
    })
  }
  return out
}

export function formatWorktreeAudit(audit: WorktreeAudit[]): string {
  const out: string[] = []
  for (const a of audit) {
    const verdict = a.safeToRemove ? 'SAFE' : 'KEEP'
    const branch = a.branch ?? '(detached)'
    const ahead = a.ahead === null ? '' : ` ahead ${a.ahead}`
    out.push(`${verdict}  ${a.path}  ${branch} @ ${a.head.slice(0, 7)}${ahead}`)
    for (const r of a.reasons) out.push(`        ${r}`)
  }
  const safe = audit.filter(a => a.safeToRemove).length
  out.push(
    `${safe} of ${audit.length} worktrees safe to remove (nothing was removed)`
  )
  return out.join('\n')
}
