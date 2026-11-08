/**
 * Cloud-session guard as an allow list (#2528, after red-district#1572).
 *
 * The label guard (#2519) refused one label and left every other GitHub
 * write open: with CLAUDE_CODE_REMOTE=true, `gh pr merge`, `gh workflow
 * disable`, `gh api -X PUT …/merge` and `git push origin HEAD:main` all
 * passed. A cloud worker acts as rservant, and main's ruleset has no
 * pull_request rule, so those land.
 *
 * In the cloud VM the guard now allows, and refuses everything else in
 * these families:
 *   - gh: `gh api` (below) and read-only `view`/`list` (plus a few reads:
 *     pr diff/checks/status, run watch/download, auth status, search).
 *   - gh api and curl/wget to GitHub: GET anywhere but graphql; POST pulls,
 *     issues/N/comments, pulls/N/comments; POST pulls/N/reviews only with
 *     event=COMMENT; PATCH pulls/N only with title/body/draft; POST
 *     issues/N/labels only with preview-smoke (docs/cloud-sessions.md).
 *   - git push: only the session's own branch, never from main.
 * Anything it cannot parse is refused (fail closed).
 *
 * Defence in depth only: the real control is GitHub-side (a pull_request
 * rule on main, or a separate agent identity, ops#242).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const GUARD = resolve(ROOT, 'scripts/cloud-session-guard.sh')

const R = 'repos/taverns-red/toast-stats'
const API = `https://api.github.com/${R}`
const BRANCH = 'fix/2528-x'

function run(command: string, cwd = ROOT, remote = 'true') {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' }
  if (remote !== '') env.CLAUDE_CODE_REMOTE = remote
  return spawnSync('bash', [GUARD], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
      cwd,
    }),
    cwd,
    env,
    encoding: 'utf8',
  })
}

function expectRefused(command: string, cwd = ROOT) {
  const r = run(command, cwd)
  expect(r.status, `${command}\n${r.stderr}`).toBe(2)
  expect(r.stderr).toMatch(/Ron/)
}

function expectAllowed(command: string, cwd = ROOT) {
  const r = run(command, cwd)
  expect(r.stderr, command).toBe('')
  expect(r.status, command).toBe(0)
}

/** A throwaway repo on a feature branch, with origin pointing at GitHub. */
function makeRepo(branch = BRANCH) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-2528-'))
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  git('commit', '-q', '--allow-empty', '-m', 'init')
  git(
    'remote',
    'add',
    'origin',
    'https://github.com/taverns-red/toast-stats.git'
  )
  if (branch !== 'main') git('checkout', '-q', '-b', branch)
  return { dir, git }
}

describe('gh subcommands: refused unless allow-listed (#2528)', () => {
  it.each([
    // the #2528 dry runs
    'gh pr merge 1 --squash',
    'gh pr review 1 --approve',
    'gh workflow disable data-pipeline.yml',
    // red-district#1572
    'gh workflow enable data-pipeline.yml',
    'gh workflow run data-pipeline.yml -f date=2026-11-07',
    'gh repo edit --default-branch other',
    'gh repo edit --enable-auto-merge',
    'gh repo delete taverns-red/toast-stats --yes',
    'gh cache delete --all',
    'gh secret set NPM_TOKEN --body x',
    'gh secret delete NPM_TOKEN',
    'gh variable set X --body y',
    'gh variable delete X',
    'gh ruleset',
    'gh ruleset check main',
    'gh codespace create',
    'gh extension install someone/gh-x',
    'gh release create v9.9.9',
    'gh release delete v2.80.0 --yes',
    'gh release edit v2.80.0 --draft',
    'gh label create my-new-label --color 00ff00',
    'gh label edit bug --name x',
    'gh label delete bug --yes',
    'gh run cancel 123',
    'gh run rerun 123',
    'gh run rerun 123 --failed',
    'gh run delete 123',
    // other writes a worker has no use for
    'gh pr review 1 --comment -b looks-good',
    'gh pr review 1 --request-changes -b no',
    'gh pr edit 12 --add-label bug',
    'gh pr edit 12 --add-label preview-smoke',
    'gh issue edit 12 --remove-label preview-smoke',
    'gh pr create --title t --body b',
    'gh pr comment 1 --body x',
    'gh pr close 1',
    'gh pr reopen 1',
    'gh pr ready 1',
    'gh pr checkout 1',
    'gh issue create --title t --body b',
    'gh issue close 1',
    'gh issue comment 1 --body x',
    'gh issue delete 1 --yes',
    'gh alias set m "pr merge"',
    'gh auth logout',
    'gh auth token',
    'gh gist create f.txt',
    'gh repo fork',
    'gh repo sync',
    'gh workflow',
    'gh',
    // with gh's repo and host flags anywhere (#2526)
    'gh -R taverns-red/toast-stats pr merge 1 --squash',
    'gh pr --repo taverns-red/toast-stats merge 1',
    'gh pr merge -R taverns-red/toast-stats 1 --admin',
    'gh --repo=taverns-red/toast-stats workflow disable ci.yml',
    'gh workflow -R taverns-red/toast-stats disable ci.yml',
    'gh pr review --repo=taverns-red/toast-stats 1 --approve',
    // a flag we cannot place, before the verb
    'gh pr --web merge 1',
    'gh --foo pr view 1',
    // spelling and wrappers
    'GH PR MERGE 1',
    '"gh" "pr" "merge" 1',
    '/usr/local/bin/gh pr merge 1',
    'env GH_REPO=taverns-red/toast-stats gh pr merge 1',
    'command gh pr merge 1',
    'nohup gh pr merge 1 &',
    'npm test && gh pr merge 1',
    "bash -c 'gh pr merge 1'",
    'sh -c "gh workflow disable ci.yml"',
    'eval "gh pr merge 1"',
    'echo $(gh pr merge 1)',
    'echo `gh pr merge 1`',
    '( gh pr merge 1 )',
    '{ gh pr merge 1; }',
    'if gh pr merge 1; then echo ok; fi',
    'xargs -n1 gh pr merge < prs.txt',
    'echo 1 | xargs gh pr merge',
    // built at run time
    'gh pr $VERB 1',
    'gh "$GROUP" merge 1',
    'G=gh; $G pr merge 1',
    "alias m='gh pr merge'",
    // unparseable
    `gh pr view 1 'unbalanced`,
  ])('%s', command => expectRefused(command))
})

describe('gh subcommands: reads stay allowed (#2528)', () => {
  it.each([
    'gh pr view 12',
    'gh pr view 12 --json title,body,headRefOid',
    'gh pr list --state open',
    'gh pr diff 12',
    'gh pr checks 12',
    'gh pr status',
    'gh issue view 2528 --comments',
    'gh issue list --label bug',
    'gh run view 123 --log-failed',
    'gh run list --limit 5',
    'gh run watch 123',
    'gh workflow list',
    'gh workflow view ci.yml',
    'gh repo view taverns-red/toast-stats',
    'gh release list',
    'gh release view v2.80.0',
    'gh label list',
    'gh cache list',
    'gh ruleset list',
    'gh ruleset view 11350451',
    'gh auth status',
    'gh search issues guard --repo taverns-red/toast-stats',
    'gh --version',
    'gh help',
    'gh pr --help',
    // red-district#1572 reference read
    'gh issue view 1572 --repo taverns-red/red-district',
    'gh -R taverns-red/red-district issue view 1572',
    'gh pr view 12 -R taverns-red/toast-stats',
    'gh issue --repo=taverns-red/toast-stats list',
    'gh pr view 12 | head -20',
    'gh pr view 12 2>&1 | tail -5',
  ])('%s', command => expectAllowed(command))
})

describe('gh api: refused unless method and path are allow-listed (#2528)', () => {
  it.each([
    // the #2528 dry runs
    `gh api -X PUT ${R}/pulls/1/merge`,
    `gh api -X PUT ${R}/actions/workflows/x/disable`,
    // merge, every spelling of the method
    `gh api --method PUT ${R}/pulls/1/merge -f merge_method=squash`,
    `gh api --method=PUT ${R}/pulls/1/merge`,
    `gh api -XPUT ${R}/pulls/1/merge`,
    `gh api -X put ${R}/pulls/1/merge`,
    `gh api ${R}/pulls/1/merge -f merge_method=squash`,
    `gh api ${R}/pulls/1/merge --input m.json`,
    `gh api -X PUT ${API}/pulls/1/merge`,
    `gh api -X PUT /${R}/pulls/1/merge`,
    `gh -R taverns-red/toast-stats api -X PUT ${R}/pulls/1/merge`,
    `gh api --hostname github.com -X PUT ${R}/pulls/1/merge`,
    // workflows
    `gh api -X PUT ${R}/actions/workflows/ci.yml/enable`,
    `gh api ${R}/actions/workflows/ci.yml/dispatches -f ref=main`,
    `gh api -X POST ${R}/actions/runs/1/rerun`,
    `gh api -X POST ${R}/actions/runs/1/cancel`,
    // refs and repository settings
    `gh api -X POST ${R}/git/refs -f ref=refs/heads/main -f sha=abc`,
    `gh api -X PATCH ${R}/git/refs/heads/main -f sha=abc -F force=true`,
    `gh api -X DELETE ${R}/git/refs/heads/fix/x`,
    `gh api -X PATCH ${R} -f default_branch=other`,
    `gh api -X DELETE ${R}`,
    `gh api -X PUT ${R}/branches/main/protection --input p.json`,
    `gh api -X PUT ${R}/rulesets/11350451 --input r.json`,
    `gh api -X DELETE "${R}/actions/caches?key=x"`,
    `gh api -X PUT ${R}/actions/secrets/X -f encrypted_value=x`,
    `gh api -X POST ${R}/actions/variables -f name=X -f value=y`,
    `gh api -X POST ${R}/releases -f tag_name=v9`,
    // labels: only preview-smoke onto an issue or PR
    `gh api ${R}/labels -f name=x -f color=ffffff`,
    `gh api -X DELETE ${R}/labels/bug`,
    `gh api ${R}/issues/12/labels -f 'labels[]=bug'`,
    `gh api ${R}/issues/12/labels -f 'labels[]=preview-smoke' -f 'labels[]=bug'`,
    `gh api -X PUT ${R}/issues/12/labels -f 'labels[]=preview-smoke'`,
    `gh api ${R}/issues/12/labels --input l.json`,
    `gh api -X DELETE ${R}/issues/12/labels/preview-smoke`,
    // filing issues (CLAUDE.md: workers don't)
    `gh api ${R}/issues -f title=x -f body=y`,
    `gh api -X PATCH ${R}/issues/12 -f state=closed`,
    // reviews: only event=COMMENT
    `gh api ${R}/pulls/1/reviews -f event=APPROVE`,
    `gh api ${R}/pulls/1/reviews -f event=approve`,
    `gh api ${R}/pulls/1/reviews -f event=REQUEST_CHANGES -f body=x`,
    `gh api ${R}/pulls/1/reviews -f body=x`,
    `gh api ${R}/pulls/1/reviews -f event=COMMENT -f event=APPROVE`,
    `gh api ${R}/pulls/1/reviews --input review.json`,
    `gh api ${R}/pulls/1/reviews -F event=@e.txt`,
    `gh api ${R}/pulls/1/reviews -f event="$E"`,
    `gh api -X POST ${R}/pulls/1/reviews/9/events -f event=APPROVE`,
    `gh api -X PUT ${R}/pulls/1/reviews/9/dismissals -f message=x`,
    // PATCH a PR: only title, body, draft (ops: base, state,
    // maintainer_can_modify are refused alone or with title/body)
    `gh api -X PATCH ${R}/pulls/1 -f base=main`,
    `gh api -X PATCH ${R}/pulls/1 -f state=closed`,
    `gh api -X PATCH ${R}/pulls/1 -F maintainer_can_modify=false`,
    `gh api -X PATCH ${R}/pulls/1 -f title=x -f base=main`,
    `gh api -X PATCH ${R}/pulls/1 -f body=x -f state=closed`,
    `gh api -X PATCH ${R}/pulls/1 -f title=x -F maintainer_can_modify=true`,
    `gh api -X PATCH ${R}/pulls/1 --input pr.json`,
    `gh api -X PATCH ${R}/pulls/1`,
    // graphql: every method
    `gh api graphql -f query='query { viewer { login } }'`,
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }'`,
    `gh api -X GET graphql -f query='query { viewer { login } }'`,
    // a method override header
    `gh api ${R}/pulls/1/merge -H 'X-HTTP-Method-Override: PUT'`,
    // path tricks
    `gh api -X POST ${R}/issues/1/comments/../../../pulls/1/merge`,
    `gh api -X PUT ${R}/pulls/1%2Fmerge`,
    `gh api -X PUT ${R}/pulls/1%252Fmerge`,
    `gh api -X POST "${R}/issues/1/comments?x=1/../../../../pulls/1/merge"`,
    // built at run time, or unparseable
    `gh api -X "$M" ${R}/pulls/1/merge`,
    `gh api -X PUT ${R}/pulls/$N/merge`,
    `gh api "$P" -f x=y`,
    `gh api -X PUT $(echo ${R}/pulls/1/merge)`,
    `gh api --frobnicate ${R}/issues/1/comments -f body=x`,
    `gh api ${R}/issues/1/comments ${R}/pulls/1/merge -f body=x`,
    `gh api -X`,
  ])('%s', command => expectRefused(command))
})

describe('gh api: the worker patterns stay allowed (#2528)', () => {
  it.each([
    // CLAUDE.md, Cloud workers
    `gh api repos/taverns-red/toast-stats/pulls -f title='fix: … (#42)' -f head=${BRANCH} -f base=main -F body=@pr-body.md`,
    `gh api repos/taverns-red/toast-stats/issues/42/comments -f body='…'`,
    `gh api ${R}/issues/42/comments -F body=@report.md`,
    `gh api ${R}/issues/42/comments --input comment.json`,
    `gh api ${R}/pulls --input pr.json`,
    `gh api repos/{owner}/{repo}/issues/42/comments -f body=done`,
    // docs/cloud-sessions.md: preview-smoke on a draft
    `gh api ${R}/issues/12/labels -f 'labels[]=preview-smoke'`,
    // reads
    `gh api ${R}/pulls/1`,
    `gh api ${R}/pulls/1/merge`,
    `gh api "${R}/actions/runs?head_sha=abc&per_page=100"`,
    `gh api -X GET ${R}/commits/abc/check-runs --paginate`,
    `gh api --method GET search/issues -f q=guard`,
    `gh api ${R}/issues/12/events --paginate --jq '.[].event'`,
    `gh api -H 'Accept: application/vnd.github+json' ${R}/pulls/1/files`,
    `gh api ${API}/pulls/1`,
    // review comments and COMMENT reviews
    `gh api ${R}/pulls/1/comments -f body=x -f commit_id=abc -f path=a.ts -F line=3`,
    `gh api ${R}/pulls/1/reviews -f event=COMMENT -f body=x`,
    `gh api --method POST ${R}/pulls/1/reviews -f event=COMMENT -F body=@r.md`,
    // PATCH title, body, draft
    `gh api -X PATCH ${R}/pulls/1 -f title=x`,
    `gh api -X PATCH ${R}/pulls/1 -F body=@pr-body.md`,
    `gh api --method=PATCH ${R}/pulls/1 -f title=x -f body=y`,
    `gh api -X PATCH ${R}/pulls/1 -F draft=true`,
    // with gh's repo and host flags
    `gh -R taverns-red/toast-stats api ${R}/issues/42/comments -f body=x`,
    `gh api --hostname github.com ${R}/pulls/1`,
  ])('%s', command => expectAllowed(command))
})

describe('curl and wget to GitHub: same rules (#2528)', () => {
  it.each([
    `curl -X PUT -H "Authorization: token $T" ${API}/pulls/1/merge`,
    `curl -XPUT ${API}/pulls/1/merge -d '{"merge_method":"squash"}'`,
    `curl --request=PUT ${API}/pulls/1/merge`,
    `curl -X POST ${API}/actions/workflows/ci.yml/dispatches -d '{"ref":"main"}'`,
    `curl ${API}/actions/workflows/ci.yml/dispatches -d '{"ref":"main"}'`,
    `curl --request PATCH ${API} -d '{"default_branch":"x"}'`,
    `curl ${API}/git/refs --json '{"ref":"refs/heads/main","sha":"a"}'`,
    `curl -X POST ${API}/pulls/1/reviews -d '{"event":"APPROVE"}'`,
    `curl -X POST ${API}/pulls/1/reviews -d @review.json`,
    `curl -X POST ${API}/pulls/1/reviews -d '{"event":"COMMENT"' -d '"x":1}'`,
    `curl -X PATCH ${API}/pulls/1 -d '{"base":"main"}'`,
    `curl -X PATCH ${API}/pulls/1 -d '{"title":"x","state":"closed"}'`,
    `curl -T m.json ${API}/pulls/1/merge`,
    `curl -X POST https://api.github.com/graphql -d '{"query":"query{viewer{login}}"}'`,
    `curl -H 'X-HTTP-Method-Override: PUT' ${API}/pulls/1/merge`,
    `curl -K req.cfg`,
    `curl -X POST "$URL" -d x`,
    `curl -X PUT ${API}/pulls/$N/merge`,
    `curl -X POST https://github.com/taverns-red/toast-stats.git/git-receive-pack --data-binary @pack`,
    `wget --method=PUT ${API}/pulls/1/merge`,
    `wget --post-data='{"ref":"main"}' ${API}/actions/workflows/x/dispatches`,
    `wget --method=PATCH --body-data='{"base":"main"}' ${API}/pulls/1`,
    `wget -e method=PUT ${API}/pulls/1/merge`,
    // adversarial review: one curl, several requests, each with its method
    `curl -X PUT ${API}/pulls/1/merge --next -X GET ${API}/pulls/1`,
    `curl -X PUT ${API}/pulls/1/merge -: ${API}/pulls/1`,
    // a request line whose path is not the URL's
    `curl -X POST --request-target /${R}/actions/workflows/x/dispatches ${API}/pulls -d '{"ref":"main"}'`,
    // URL globbing expands to several paths
    `curl -X POST '${API}/{pulls,actions/workflows/x/dispatches}' -d '{"ref":"main"}'`,
    `curl -X POST '${API}/issues/[1-2]/comments' -d '{"body":"x"}'`,
    // wget takes unambiguous abbreviations of long options
    `wget --meth=PUT ${API}/pulls/1/merge`,
    `wget --post-d='{"ref":"main"}' ${API}/actions/workflows/x/dispatches`,
    // other HTTP clients to GitHub
    `http PUT ${API}/pulls/1/merge`,
    `xh put ${API}/pulls/1/merge`,
  ])('refuses %s', command => expectRefused(command))

  it.each([
    `curl -s ${API}/pulls/1`,
    `curl -s -H "Authorization: token $T" ${API}/actions/runs`,
    `curl -sSL https://registry.npmjs.org/vitest`,
    `curl -X POST ${API}/issues/1/comments -d '{"body":"x"}'`,
    `curl -X POST ${API}/pulls -d @pr.json`,
    `curl -X POST ${API}/pulls/1/reviews -d '{"event":"COMMENT","body":"x"}'`,
    `curl -X PATCH ${API}/pulls/1 -d '{"title":"x","body":"y"}'`,
    `curl -X POST ${API}/issues/1/labels -d '{"labels":["preview-smoke"]}'`,
    `curl -X POST https://example.com/hook -d x`,
    `wget -qO- ${API}/pulls/1`,
  ])('allows %s', command => expectAllowed(command))
})

describe('git push: only the session’s own branch (#2528)', () => {
  let repo: ReturnType<typeof makeRepo>
  let onMain: ReturnType<typeof makeRepo>
  let other: string
  beforeAll(() => {
    repo = makeRepo()
    onMain = makeRepo('main')
    other = mkdtempSync(join(tmpdir(), 'guard-2528-other-'))
  })
  afterAll(() => {
    for (const d of [repo.dir, onMain.dir, other])
      rmSync(d, { recursive: true, force: true })
  })

  it.each([
    // the #2528 dry run
    'git push origin HEAD:main',
    'git push origin HEAD:refs/heads/main',
    'git push origin HEAD:other',
    `git push origin HEAD:refs/heads/other`,
    `git push origin +HEAD:${BRANCH}`,
    `git push origin +refs/heads/${BRANCH}:refs/heads/${BRANCH}`,
    'git push origin +refs/heads/main',
    `git push origin ${BRANCH}:main`,
    'git push --mirror origin',
    'git push --all origin',
    'git push --branches origin',
    'git push --tags',
    'git push origin --tags',
    `git push --follow-tags origin ${BRANCH}`,
    `git push origin :${BRANCH}`,
    'git push origin :other',
    `git push origin --delete ${BRANCH}`,
    `git push -d origin ${BRANCH}`,
    'git push origin main',
    'git push origin other-branch',
    `git push origin ${BRANCH} HEAD:main`,
    'git push origin HEAD:refs/tags/v1',
    'git push origin refs/tags/v1',
    `git push origin 'refs/heads/*:refs/heads/*'`,
    `git push -f origin ${BRANCH}`,
    `git push --force origin ${BRANCH}`,
    `git push -uf origin ${BRANCH}`,
    `git push --no-verify origin ${BRANCH}`,
    `git push --prune origin ${BRANCH}`,
    `git push -o ci.skip origin ${BRANCH}`,
    `git push --repo=origin`,
    `git push --frobnicate origin ${BRANCH}`,
    'git push origin "$B"',
    'git push origin HEAD:$B',
    `git push https://github.com/taverns-red/toast-stats.git HEAD:${BRANCH}`,
    `git -c remote.origin.push=HEAD:main push`,
    `git -c push.default=matching push`,
    `git --git-dir=/elsewhere/.git push origin ${BRANCH}`,
    `GIT_DIR=/elsewhere/.git git push origin ${BRANCH}`,
    // wrappers
    "bash -c 'git push origin HEAD:main'",
    'echo $(git push origin HEAD:main)',
    'true && git push origin HEAD:main',
    'nohup git push origin HEAD:main > push.log 2>&1 &',
    'g\\it push origin HEAD:main',
    '/usr/bin/git push origin HEAD:main',
    // config changed in the same command
    `git config alias.p 'push origin HEAD:main' && git p`,
    `git config remote.origin.push HEAD:main && git push`,
    `echo '[remote "origin"] push = HEAD:main' >> .git/config && git push`,
  ])('refuses %s', command => expectRefused(command, repo.dir))

  it.each([
    'git push',
    'git push origin',
    `git push -u origin ${BRANCH}`,
    `git push --set-upstream origin ${BRANCH}`,
    'git push origin HEAD',
    'git push -u origin HEAD',
    `git push origin HEAD:${BRANCH}`,
    `git push origin HEAD:refs/heads/${BRANCH}`,
    `git push origin refs/heads/${BRANCH}:refs/heads/${BRANCH}`,
    `git push --force-with-lease origin ${BRANCH}`,
    `git push --force-with-lease=${BRANCH}:abc origin ${BRANCH}`,
    `git push -u origin ${BRANCH} 2>&1 | tail -5`,
    `nohup git push -u origin ${BRANCH} > push.log 2>&1 &`,
    `git push -q -u origin ${BRANCH} && git log --oneline -1`,
    'git status && git commit -m "x (#2528)" && git push',
  ])('allows %s', command => expectAllowed(command, repo.dir))

  it('reads the branch of the directory git -C or cd names', () => {
    expectAllowed(`git -C ${repo.dir} push -u origin ${BRANCH}`, other)
    expectAllowed(`cd ${repo.dir} && git push -u origin ${BRANCH}`, other)
    expectRefused(`git -C ${repo.dir} push origin HEAD:main`, other)
    expectRefused(`cd ${repo.dir} && git push origin HEAD:main`, other)
    expectRefused(`git -C ${onMain.dir} push origin HEAD`, repo.dir)
    expectRefused(`cd ${onMain.dir} && git push`, repo.dir)
    expectRefused(`cd "$D" && git push`, repo.dir)
  })

  it('does not let a cd inside $(...) move the outer command', () => {
    expectAllowed(
      `echo $(cd ${onMain.dir}) && git push -u origin ${BRANCH}`,
      repo.dir
    )
    expectRefused(`echo $(cd ${repo.dir}) && git push`, onMain.dir)
  })

  it('refuses any push outside a git repository', () => {
    expectRefused(`git push -u origin ${BRANCH}`, other)
  })

  it.each([
    'git push',
    'git push origin',
    'git push origin main',
    'git push -u origin main',
    'git push origin HEAD',
    'git push origin HEAD:main',
  ])('refuses %s when the current branch is main', command =>
    expectRefused(command, onMain.dir)
  )

  it('refuses when the current branch is the default branch', () => {
    const r = makeRepo('trunk')
    try {
      r.git(
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
        'refs/remotes/origin/trunk'
      )
      expectRefused('git push -u origin trunk', r.dir)
      expectRefused('git push', r.dir)
    } finally {
      rmSync(r.dir, { recursive: true, force: true })
    }
  })

  it('refuses a detached HEAD', () => {
    const r = makeRepo()
    try {
      r.git('checkout', '-q', '--detach')
      expectRefused('git push origin HEAD', r.dir)
    } finally {
      rmSync(r.dir, { recursive: true, force: true })
    }
  })

  it('refuses a bare push when config sends it elsewhere', () => {
    const r = makeRepo()
    try {
      r.git('config', 'remote.origin.push', 'HEAD:main')
      expectRefused('git push', r.dir)
      expectRefused(`git push origin ${BRANCH}`, r.dir)
      r.git('config', '--unset', 'remote.origin.push')
      r.git('config', 'push.default', 'matching')
      expectRefused('git push', r.dir)
      expectRefused('git push origin', r.dir)
      r.git('config', 'push.default', 'upstream')
      r.git('config', `branch.${BRANCH}.remote`, 'origin')
      r.git('config', `branch.${BRANCH}.merge`, 'refs/heads/main')
      expectRefused('git push', r.dir)
      r.git('config', '--unset', 'push.default')
      r.git('config', 'remote.origin.mirror', 'true')
      expectRefused(`git push origin ${BRANCH}`, r.dir)
    } finally {
      rmSync(r.dir, { recursive: true, force: true })
    }
  })

  it('refuses a git alias, whatever it runs', () => {
    const r = makeRepo()
    try {
      r.git('config', 'alias.p', 'push origin HEAD:main')
      expectRefused('git p', r.dir)
    } finally {
      rmSync(r.dir, { recursive: true, force: true })
    }
  })

  it('leaves other git commands alone', () => {
    for (const c of [
      'git status',
      'git log --oneline -5',
      'git fetch origin main',
      'git commit -m "test: x (#2528)"',
      'git checkout -b fix/2528-y',
      'git config user.name x',
      'git config --get remote.origin.push',
    ])
      expectAllowed(c, repo.dir)
  })
})

describe('inline code that drives GitHub is refused (#2528)', () => {
  it.each([
    `python3 -c "import subprocess; subprocess.run(['gh','pr','merge','1'])"`,
    `node -e "require('child_process').execSync('git push origin HEAD:main')"`,
    `perl -e 'system("gh workflow disable ci.yml")'`,
    `node -e "fetch('${API}/pulls/1/merge',{method:'PUT'})"`,
  ])('%s', command => expectRefused(command))

  it('allows inline code that does not', () => {
    expectAllowed(`node -e "console.log(1 + 1)"`)
    expectAllowed(`python3 -c "print('ok')"`)
  })
})

describe('commands that are not gh, curl, wget or git push', () => {
  it.each([
    'npm run test:scripts',
    'grep -rn "gh pr merge" scripts/',
    'grep -rn gh scripts/',
    'git commit -m "docs: gh pr merge is refused (#2528)"',
    'echo "git push origin HEAD:main is refused"',
    `cat > /tmp/notes.txt <<'EOF'\ngh pr merge 1\ngit push origin HEAD:main\nEOF`,
    './bin/agent-cli ci-wait 2530',
    'ls -la && echo $HOME',
  ])('allows %s', command => expectAllowed(command))
})

describe('the allow list is tamper-protected and documented (#2528)', () => {
  it.each([
    ['Write', 'scripts/cloud-session-guard-allowlist.mjs'],
    ['Edit', 'scripts/lib/__tests__/cloudSessionGuardAllowList.test.ts'],
  ])('refuses a %s of %s', (tool, path) => {
    const r = spawnSync('bash', [GUARD], {
      input: JSON.stringify({
        tool_name: tool,
        tool_input: {
          file_path: `${ROOT}/${path}`,
          content: '',
          old_string: 'a',
          new_string: 'b',
        },
      }),
      env: { PATH: process.env.PATH ?? '', CLAUDE_CODE_REMOTE: 'true' },
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
  })

  it('refuses sed on the allow-list module', () =>
    expectRefused('sed -i s/x/y/ scripts/cloud-session-guard-allowlist.mjs'))

  it('is a no-op outside a cloud session', () => {
    for (const remote of ['', 'false']) {
      const r = run('gh pr merge 1 --squash', ROOT, remote)
      expect(r.status).toBe(0)
      expect(r.stderr).toBe('')
      const p = run('git push origin HEAD:main', ROOT, remote)
      expect(p.status).toBe(0)
    }
  })

  it('CLAUDE.md and docs/cloud-sessions.md say it is an allow list', () => {
    for (const f of ['CLAUDE.md', 'docs/cloud-sessions.md']) {
      const md = readFileSync(resolve(ROOT, f), 'utf8')
      expect(md, f).toMatch(/allow list/i)
      expect(md, f).toMatch(/#2528/)
    }
  })
})
