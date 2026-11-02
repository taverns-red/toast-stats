# Cloud sessions (Claude Code on the web)

Phase 1 of #2454: a Claude Code cloud session can pick up one issue, work it under the same rules as a local session, and open a PR for Ron's local session to review and merge.

## What the repo provides

| Piece                                 | What it does                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json`               | Committed. A short `permissions.allow` list (npm scripts, vitest, tsc, prettier, eslint, everyday git, `gh api`) and two hooks. No deny rules, no env, no plugins.                                                                                      |
| `scripts/cloud-session-setup.sh`      | `SessionStart` (startup, resume). In the VM: `npm ci`, then builds shared-contracts, analytics-core, collector-cli and mcp-server, the same builds CI runs before typecheck and tests (their `dist/` is gitignored, R16). Fails loudly if a step fails. |
| `scripts/cloud-session-stop-check.sh` | `Stop`. In the VM: warns when the branch has no upstream, has unpushed commits, or is behind. Same messages as Ron's global Stop hook.                                                                                                                  |
| `CLAUDE.md`                           | "Rules for every session (local and cloud)" states the rules from the global `~/.claude/CLAUDE.md`, which cloud sessions don't load, plus the cloud-worker rules.                                                                                       |

Both hooks exit 0 at once unless `CLAUDE_CODE_REMOTE=true`, so local sessions only gain the allow rules. `scripts/lib/__tests__/cloudSessionConfig.test.ts` pins that.

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
