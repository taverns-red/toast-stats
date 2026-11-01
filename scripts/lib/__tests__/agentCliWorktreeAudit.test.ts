/**
 * agent-cli worktree-audit (#2418). "Safe to remove" means exactly one
 * thing: the worktree is clean and its local tip is contained in a MERGED
 * PR's head, checked against `pull/N/head` — because once the remote branch
 * is deleted, `origin/<b>..<b>` reads 0 and proves nothing.
 */
import { describe, it, expect } from 'vitest'
import {
  auditWorktrees,
  formatWorktreeAudit,
  parseWorktreePorcelain,
} from '../agentCli/worktreeAudit.js'
import { fakeRunner, fixture, ok, fail, noSleep } from './agentCliFakes.js'

const REPO = 'taverns-red/toast-stats'

describe('parseWorktreePorcelain', () => {
  it('parses the real porcelain listing', () => {
    expect(parseWorktreePorcelain(fixture('worktree-list.porcelain'))).toEqual([
      {
        path: '/Users/rservant/code/toast-stats',
        head: 'f14322b68fb7d541837659e5a71cfa04e28063d4',
        branch: null,
        detached: true,
        bare: false,
        locked: false,
        prunable: false,
      },
      {
        path: '/Users/rservant/code/toast-stats-2418',
        head: '019ad7fa9b18402bfb5491afeb0c146109f267c5',
        branch: 'feat/2418-agent-cli',
        detached: false,
        bare: false,
        locked: false,
        prunable: false,
      },
    ])
  })

  it('reads locked and prunable markers', () => {
    const [w] = parseWorktreePorcelain(
      'worktree /x\nHEAD abc\nbranch refs/heads/b\nlocked in use\nprunable gitdir file points to non-existent location\n'
    )
    expect(w).toMatchObject({ branch: 'b', locked: true, prunable: true })
  })
})

const PORCELAIN = [
  'worktree /repo\nHEAD 1111111111111111111111111111111111111111\ndetached\n',
  'worktree /wt/a\nHEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nbranch refs/heads/feat/a\n',
  'worktree /wt/b\nHEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\nbranch refs/heads/feat/b\n',
  'worktree /wt/c\nHEAD cccccccccccccccccccccccccccccccccccccccc\nbranch refs/heads/feat/c\n',
  'worktree /wt/d\nHEAD dddddddddddddddddddddddddddddddddddddddd\nbranch refs/heads/feat/d\n',
].join('\n')

function pr(number: number, oid: string) {
  return JSON.stringify([
    {
      number,
      state: 'MERGED',
      headRefOid: oid,
      mergedAt: '2026-10-30T12:00:00Z',
      url: `https://github.com/taverns-red/toast-stats/pull/${number}`,
    },
  ])
}

function scenario() {
  return fakeRunner([
    [/^git worktree list --porcelain$/, ok(PORCELAIN)],
    // Dirty state: only /wt/c has a modified file.
    [
      /^git -C \/wt\/c status --porcelain=v1$/,
      ok(' M src/x.ts\n?? notes.txt\n'),
    ],
    [/^git -C \S+ status --porcelain=v1$/, ok('')],
    // Every remote branch was deleted on merge: no upstream, no origin ref.
    [
      /rev-parse --abbrev-ref --symbolic-full-name @\{u\}$/,
      fail("fatal: no upstream configured for branch 'feat/a'", 128),
    ],
    [/^git show-ref --verify --quiet refs\/remotes\/origin\//, fail('', 1)],
    [
      /^gh pr list .*--head feat\/a /,
      ok(pr(10, 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0')),
    ],
    [
      /^gh pr list .*--head feat\/b /,
      ok(pr(11, 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0')),
    ],
    [
      /^gh pr list .*--head feat\/c /,
      ok(pr(12, 'cccccccccccccccccccccccccccccccccccccccc')),
    ],
    [/^gh pr list .*--head feat\/d /, ok('[]')],
    // PR 10's head is not local yet, so it must be fetched from pull/10/head.
    [
      /^git cat-file -e a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0\^\{commit\}$/,
      [fail('', 1), ok('')],
    ],
    [/^git cat-file -e /, ok('')],
    [
      /^git fetch --no-write-fetch-head --quiet origin refs\/pull\/10\/head$/,
      ok(''),
    ],
    [/^git merge-base --is-ancestor a{40} (a0){20}$/, ok('')],
    // feat/b has a commit the PR never got.
    [/^git merge-base --is-ancestor b{40} (b0){20}$/, fail('', 1)],
    [/^git merge-base --is-ancestor c{40} c{40}$/, ok('')],
  ])
}

describe('auditWorktrees', () => {
  it('marks only the clean worktree whose tip is in the merged PR head as safe', async () => {
    const runner = scenario()
    const audit = await auditWorktrees({
      repo: REPO,
      runner,
      sleep: noSleep,
      cwd: '/repo',
    })
    const byPath = Object.fromEntries(audit.map(a => [a.path, a]))

    expect(byPath['/repo']).toMatchObject({
      primary: true,
      safeToRemove: false,
    })
    expect(byPath['/wt/a']).toMatchObject({
      safeToRemove: true,
      remoteBranchExists: false,
      tipInMergedPrHead: true,
      pr: { number: 10, state: 'MERGED' },
    })
    expect(byPath['/wt/b']).toMatchObject({
      safeToRemove: false,
      tipInMergedPrHead: false,
    })
    expect(byPath['/wt/b'].reasons.join(' ')).toMatch(
      /not contained in merged PR #11/
    )
    expect(byPath['/wt/c']).toMatchObject({
      safeToRemove: false,
      dirty: true,
      dirtyFiles: 1,
      untracked: 1,
    })
    expect(byPath['/wt/d']).toMatchObject({ safeToRemove: false, pr: null })

    expect(runner.calls).toContain(
      'git fetch --no-write-fetch-head --quiet origin refs/pull/10/head'
    )
  })

  it('never runs a mutating git or gh command', async () => {
    const runner = scenario()
    await auditWorktrees({ repo: REPO, runner, sleep: noSleep, cwd: '/repo' })
    const mutating =
      /worktree (remove|prune)|branch -[dD]|\bpush\b|\breset\b|\bcheckout\b|pr (merge|close)|\bdelete\b/
    expect(runner.calls.filter(c => mutating.test(c))).toEqual([])
  })

  it('formats one line per worktree with the verdict', async () => {
    const audit = await auditWorktrees({
      repo: REPO,
      runner: scenario(),
      sleep: noSleep,
      cwd: '/repo',
    })
    const text = formatWorktreeAudit(audit)
    expect(text).toMatch(/SAFE\s+\/wt\/a/)
    expect(text).toMatch(/KEEP\s+\/wt\/b/)
  })
})
