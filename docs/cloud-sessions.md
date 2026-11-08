# Cloud sessions (Claude Code on the web)

Phase 1 of #2454: a Claude Code cloud session can pick up one issue, work it under the same rules as a local session, and open a PR for Ron's local session to review and merge.

## What the repo provides

| Piece                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json`               | Committed. A short `permissions.allow` list (npm scripts, vitest, tsc, prettier, eslint, everyday git, `gh api`) and three hooks. No deny rules, no env, no plugins.                                                                                                                                                                                                                                                                                                                                                                    |
| `scripts/cloud-session-setup.sh`      | `SessionStart` (startup, resume). In the VM: `npm ci`, then builds shared-contracts, analytics-core, collector-cli and mcp-server, the same builds CI runs before typecheck and tests (their `dist/` is gitignored, R16). Fails loudly if a step fails.                                                                                                                                                                                                                                                                                 |
| `scripts/cloud-session-guard.sh`      | `PreToolUse` (Bash, Edit, Write, MultiEdit, NotebookEdit). In the VM: exits 2 for any call that would apply, create, edit or remove `db-breaking-approved` (#2519): `gh issue/pr edit/create`, `gh label`, `gh api`, `curl`, `wget`, GraphQL label mutations, label writes whose name or payload is hidden in the shell, a file or stdin, and edits to the guard or `.claude/settings*.json`. Workers act as `rservant`, so ADR 0019 can't tell their label from Ron's. A stopgap until agents get their own GitHub identity (ops#242). |
| `scripts/cloud-session-stop-check.sh` | `Stop`. In the VM: warns when the branch has no upstream, has unpushed commits, or is behind. Same messages as Ron's global Stop hook.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `CLAUDE.md`                           | "Rules for every session (local and cloud)" states the rules from the global `~/.claude/CLAUDE.md`, which cloud sessions don't load, plus the cloud-worker rules.                                                                                                                                                                                                                                                                                                                                                                       |

**The guard is a whole-command allow list (#2528, #2547).** It is ported from the red-rostrum#75 template (d34b15a), and every case in `scripts/fixtures/guard-bypass-corpus.json` is tested. In the VM a Bash call is allowed only when it is one simple command of literal words, or an `&&` chain of them, and each command matches a shape below. Any other shell syntax is refused: `;`, `|`, `>`, `<`, `$`, backticks, `(`, `{`, `!`, globs, a backslash, `$`/backticks inside double quotes, a leading `VAR=value`, a reserved word, or a command over 4096 characters. Unknown programs are refused too.

- **Build and test:** `npm ci`, `npm install` (no arguments), `npm test`, and `npm run <script>` for the test, lint, format, typecheck, quality, build and lessons scripts in the root `package.json`. Extra arguments go only after `--`, as plain words. `npx vitest run|--run …`, `npx tsc --noEmit [--skipLibCheck]`, `npx eslint …`, `npx prettier …`. No `--config`, `--plugin` or other options that load code. `./bin/agent-cli …`.
- **git:** `status`, `diff`, `log`, `show`, `blame`, `grep`, `rev-parse`, `branch --show-current`, `fetch origin [<branch>]`, `add <paths>`, `commit -m … [-m …]` or `-F <file>`, and `push [-u] origin <session branch|HEAD|HEAD:<session branch>>` from the repository root. No option before the subcommand. No `-c`, `--no-index`, `--output`, `-O` or `--ext-diff`, or any unique prefix of a denied option. Pathspecs and `<rev>:<path>` are reads. `git add` refuses `.claude`, `.husky`, `.githooks`, `.github`, `CLAUDE.md`, `package.json`, `package-lock.json` and the guard's own files.
- **gh:** `pr create|view|list|checks|diff|comment|status`, `issue view|list|comment` and `run view|list` with inline `--body`. No `--body-file`, `-F`, labels, `--base` or `--web`, and only on this repository. `gh api repos/taverns-red/toast-stats/…`: GET, plus POST `pulls`, `issues/{n}/comments` and `pulls/{n}/comments`; POST `pulls/{n}/reviews` only with `event=COMMENT`; PATCH `pulls/{n}` only with `title`, `body` or `draft`; and POST `issues/{n}/labels` only with `preview-smoke`. No headers, no other repository or host, and nothing with `secrets` or `variables` in the path. No `curl` or `wget`.
- **Reads:** `cat`, `head`, `tail`, `wc`, `ls`, `diff`, `grep`, `rg`, `jq`, `sed -n <N[,M]p>`, `echo`, `pwd`, `node -v`, and `cd <dir>` inside the repository. Every path they read, every `-F body=@file` and `--input` file, and every git pathspec must resolve inside the repository root. Resolution uses the realpath of the nearest existing parent, against the cwd that the command's own `cd` sets. Paths may not be secret-shaped (`.env*`, `*.pem`, `*.key`, anything under `.git`) or gitignored, except `node_modules`, `dist`, `coverage`, `.vite`, `playwright-report` and `test-results`. `grep -r` over a directory holding `.git`, a secret-shaped file or other ignored files is refused. `rg` may not use `--hidden`, `-u`, `--no-ignore` or `-L`. `jq` may not read `env`, `$ENV`, `input` or `input_filename`.
- **File tools** (Write, Edit, MultiEdit, NotebookEdit) refuse secret-shaped paths and config that other tools act on: `.npmrc`, `.yarnrc*`, `.gitattributes`, `.gitmodules`, `.gitconfig`, `.envrc`, `.husky/`, `.githooks/`, `.claude/` and `.github/`. The check uses the real path, so a symlink into `.git` counts.

Writes outside the repository are allowed only under `$TMPDIR`. Inside it, `node_modules/`, `.vscode/`, `.yarn/` and `.config/` are refused as well.

**Other tools: written, but not active yet (#2547).** Today `.claude/settings.json` routes only Bash and Edit/Write/MultiEdit/NotebookEdit to the guard. The guard also judges every other tool by name, but that handling stays dormant until a PreToolUse matcher sending those tools to the same wrapper is approved:

- **Read, Grep and Glob** take the read rules above. Grep over a directory is treated like `grep -r`, and a Glob pattern may not contain `..` or an absolute path.
- **WebFetch, WebSearch, any `mcp__*` tool and unknown tools** are denied.
- **Tools with no I/O of their own** are allowed: `TodoWrite`, `ExitPlanMode`, `EnterPlanMode`, `ToolSearch`, `AskUserQuestion`, the `Task*` list tools, `SubagentHandback`, `SendMessage`, `ListAgents` and `Skill`.
- **`Agent`/`Task`** are allowed too, because a subagent's tool calls fire the same PreToolUse hooks ([hooks reference](https://code.claude.com/docs/en/hooks)).

The activation step is that matcher; the tests already feed the guard each tool's payload directly.

Write PR and comment bodies to a repo path that isn't gitignored, such as `pr-body.md`. Push with `git push -u origin <branch>` in the foreground, because `nohup … &` is shell syntax.

It is defence in depth. The real control is GitHub-side: a `pull_request` rule on `main`, or a separate agent identity (ops#242). Commands run from a script file (`bash x.sh`, `npm run`, `node x.mjs`) are out of its sight. **A blocked call means ask Ron**; don't reword the command to get past it.

All three hooks exit 0 at once unless `CLAUDE_CODE_REMOTE=true`, so local sessions only gain the allow rules. `scripts/lib/__tests__/cloudSessionConfig.test.ts` and `cloudSessionGuard.test.ts` pin that.

The setup hook also fills two gaps in the VM image (#2467), skipping each when already present:

- **`yamllint`**, installed with `pip install --user` (lands in `~/.local/bin`, already on PATH). The pre-commit hook runs `npm run lint:yaml`, which otherwise exits 127.
- **A case-folding locale, `en_US.UTF-8`**, generated with `localedef`. The image ships only `C`, `C.utf8` and `POSIX`; `scripts/lib/__tests__/lessonsIndexLocale.test.ts` needs one that folds case.

There is no Playwright in the VM. Browser smokes run in CI against the PR preview channel.

## Waiting for CI

`gh pr checks` goes through GraphQL, which the VM proxy rejects with a 403. Don't hand-roll REST polling: run `./bin/agent-cli ci-wait <pr>` (add `--once` for a snapshot). It falls back to REST on its own: the PR's head SHA, then `commits/<sha>/check-runs` (every page; PR Preview alone has more than 35 checks), with each check's workflow named from `actions/runs?head_sha=<sha>` (#2485).

A draft PR deploys the preview channel but skips the heavy PR Preview smokes and the Lighthouse mobile gate (#2101). Apply the `preview-smoke` label to run them on a draft, or mark the PR ready. Re-running a draft-era run still skips.

## Manual steps for Ron

1. **Enable the skills on claude.ai** (Settings → Capabilities → Skills): `sprint`, `ron-ux`, `ron-qe` and `review`. Cloud sessions load claude.ai-enabled skills; they don't install repo plugins. The skills stay in the private `ops` repo; they are not vendored here because this repo is public.
2. **Create the cloud environment** for `taverns-red/toast-stats`: network access **Trusted** (npm registry and GitHub are enough). Add **no environment variables and no secrets**; the setup hook needs none.

## Launching a worker on an issue

1. Make sure the issue has a description, acceptance criteria and, for a sprint, a `## Relevant lessons` list.
2. Start a session at claude.ai/code on `taverns-red/toast-stats` with that environment. Prompt, for example:
   > Work issue #NNNN. Follow CLAUDE.md. Branch from `origin/main`, TDD with separate red and green commits, then open a PR with `gh api` that references #NNNN plainly. Don't merge.
3. Wait for the setup hook to finish (a few minutes on a fresh VM) before the first test run.
4. The worker reports through the PR and issue comments. Review and merge from the local session as usual.

## Archiving a finished worker

Archive a worker's session once its PR is merged or closed. There is no CLI command or public API for this (checked against Claude Code 2.1.316), so the local session does it in the browser with Claude in Chrome:

1. **Needs:** the Claude in Chrome extension connected to the local session, with Chrome signed in to claude.ai as Ron. No token or API key is involved. Check with `list_connected_browsers`; if it returns nothing, ask Ron to connect the extension.
2. Open `claude.ai/code`, find the session under the repo's section of the sidebar, hover its row and click **More options** (⋯).
3. Click **Archive**. **Delete** is the red item just below it. Never click Delete: it can't be undone, and it loses the session transcript.
4. If a "Got it" or environment popover covers the sidebar, close it with Escape first.

Archiving is reversible and only changes the sidebar. No permission prompt has fired in practice. Whether one does depends on the Chrome extension's per-site permission for claude.ai.
