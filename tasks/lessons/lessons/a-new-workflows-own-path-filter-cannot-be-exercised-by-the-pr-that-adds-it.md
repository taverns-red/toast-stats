---
date: 2026-08-02
tier: lesson
summary: A path-filtered workflow's own filter can never be exercised by the PR that introduces it — the diff always contains the workflow file, so the filtered case reads as "mixed" until after merge; open the probe PR against a scratch base branch that widens only `pull_request.branches`
tags: [ci, github-actions, verification, workflows, path-filters]
---

# A new workflow's own path filter cannot be exercised by the PR that adds it

**Date:** 2026-08-02
**PR:** #1376 (issue #1375)

## What happened

`docs.yml` was added with a `paths:` allowlist (`**/*.md`, `tasks/**`, `docs/**`,
`.gitignore`, `LICENSE`) mirroring `ci.yml`'s `paths-ignore:`. The acceptance
criterion was "a docs-only PR runs this job and **nothing else** — confirm by
inspecting an actual PR's check list, not by reading the YAML."

That is unobservable on the introducing PR, and not for a fixable reason. The PR's
diff necessarily contains `.github/workflows/docs.yml`, which is:

- **outside** its own allowlist (it is not markdown, `tasks/`, or `docs/`), and
- **inside** `ci.yml`'s trigger set (`.github/**` is not in its `paths-ignore`).

So every PR that adds a path-filtered workflow is, by construction, a *mixed* PR.
Adding a docs file to it produces "Docs Gate + CI", never "Docs Gate alone". You
can argue the extra CI run is attributable only to the workflow file — but that is
an inference from the YAML, which is exactly what the criterion forbids.

## The trick

Path filters are evaluated against the PR diff; `pull_request.branches` is evaluated
against the **base**. Decouple them:

1. Push a scratch base branch that changes **only** `pull_request.branches` in the
   affected workflows (`[main]` -> `[main, scratch-base]`). Nothing else.
2. Branch off it, commit **only** a file inside the filter under test.
3. Open the PR with `--base scratch-base`. The diff is now purely the filtered file,
   because the workflow edits are on both sides.
4. Read `gh pr diff --name-only` **and** `gh pr checks` together — the diff proves
   what was actually being filtered.
5. Close the PR and delete both branches.

This gave the real answer: diff = one `.md`, check list = one entry, `Docs Gate pass 15s`.

## The transferable part

When a verification target is "what does the CI system do with diff shape X", the
introducing change is never a valid specimen — it perturbs the diff shape it is
trying to measure. Build the specimen separately. And the same shape recurs beyond
path filters: any conditional keyed on the diff (changed-files actions, `dorny/paths-filter`,
Turborepo/Nx affected-graph gates) is unobservable on the commit that installs it.

Corollary for the negative case, which *is* observable: a PR containing only the new
workflow files is a genuine "code-only" specimen — if the new job is absent from its
check list, the allowlist correctly excludes `.github/**`.
