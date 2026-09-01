# Branch rulesets

Checked-in, reviewable copies of the repository rulesets that protect `main`.
They are **declarative artifacts, not automation**: nothing in CI applies them.
Changing branch protection is an operator action, because a wrong ruleset locks
everybody — including the autonomous sprint-runner — out of `main`.

| File        | Live ruleset              | Applied by                                   |
| ----------- | ------------------------- | -------------------------------------------- |
| `main.json` | `Protect` (id `11350451`) | `bash scripts/apply-main-ruleset.sh --apply` |

```bash
bash scripts/apply-main-ruleset.sh          # diff live vs checked-in; exit 1 if drifted
bash scripts/apply-main-ruleset.sh --apply  # PUT the checked-in ruleset (idempotent)
```

## Why exactly one required check (#1216)

`main.json` requires a single status check, **`CI Gate`**, and deliberately
requires none of the checks that actually do the work.

Every real CI workflow here is path-filtered. `ci.yml` carries
`paths-ignore: ['**/*.md', 'tasks/**', 'docs/**', '.gitignore', 'LICENSE']`;
`docs.yml` carries the mirror-image `paths:` allowlist. A required check that
its own path filter can skip never reports at all, so it sits **Expected**
forever and the PR can never merge:

- requiring `Test Suite` deadlocks every docs-only PR,
- requiring `Docs Gate` deadlocks every code-only PR.

So the required check is an aggregator that runs **unconditionally** — no path
filter of its own — and decides. `.github/workflows/ci-gate.yml` is the job;
`scripts/lib/ciGate.ts` is the (unit-tested) logic; `scripts/ci-gate.ts` is the
runner.

## What the aggregator actually protects against

Before this, a PR could merge with **no CI at all**. On 2026-08-31, PR #1484
registered zero check-suites — not one workflow ever scheduled — yet reported
`mergeState: CLEAN` and was mergeable. It was caught only because a human
noticed.

The root cause is that "all checks passed" and "no checks ran" look identical
to a gate that inspects only the checks that are present. So `CI Gate` inverts
the direction: it derives the **expected** check set from the PR's changed
files (using `scripts/lib/changedFilesGate.ts`, the same non-code classifier
the git hooks use and the same globs the workflows filter on), then requires
each expected check to be present _and_ successful.

| Case                     | What the gate sees                                                                                               | Verdict                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Legitimately skipped** | Diff is docs-only, so `ci.yml`'s jobs were never in the expected set                                             | ✅ ignored — absence is correct                                         |
| **Never scheduled**      | Diff touches code, so `Test Suite` is expected, and no check run exists                                          | ❌ fail (this is #1484)                                                 |
| **Present but skipped**  | Expected check exists with `conclusion: skipped` (a job-level `if:`, or a job skipped because `needs:` went red) | ❌ fail — GitHub counts `skipped` as success; the gate does not         |
| **Still running**        | Expected check exists, `status != completed`                                                                     | ⏳ poll (40-min deadline, then fail)                                    |
| **Unexpected extras**    | `Security Scan`, `Deploy Preview`, Lighthouse                                                                    | ignored — not required, and preview quota flakes must not block a merge |

Absence is only ever forgiven when the _diff_ says the workflow was supposed to
be absent. Nothing is inferred from the checks themselves.

The expectation set is `Quality Gates` + `Test Suite` + `Build Applications`
(the `ci.yml` jobs) for any diff that touches code, plus `Docs Gate` for any
diff that touches a `paths:`-matched file. A mixed PR expects all four.

## Drift guards

Three artifacts have to agree or the gate either blocks a PR forever or lets
one through ungated. `scripts/lib/__tests__/ciGate.test.ts` asserts, sourced
from the files themselves:

- `ci.yml`'s `paths-ignore`, `docs.yml`'s `paths`, and `NON_CODE_GLOBS` in
  `changedFilesGate.ts` are the same list, on every trigger;
- `ci-gate.yml` has **no** `paths:` / `paths-ignore:` of its own;
- every check name the gate can expect resolves to a real job `name:`;
- `main.json` requires `CI Gate` and no path-filtered check.

## Operator runbook

1. Merge the PR that adds `ci-gate.yml`, so `CI Gate` exists on `main`.
2. Confirm the context name GitHub actually reports, and the app that reports
   it (`integration_id: 15368` is GitHub Actions):

   ```bash
   SHA=$(gh api repos/taverns-red/toast-stats/commits/main --jq .sha)
   gh api "repos/taverns-red/toast-stats/commits/$SHA/check-runs?filter=latest" \
     --jq '.check_runs[] | {name, app: .app.id, conclusion}'
   ```

3. Dry-run the diff, then apply:

   ```bash
   bash scripts/apply-main-ruleset.sh
   bash scripts/apply-main-ruleset.sh --apply
   ```

4. Verify on one PR of each shape — a code PR (blocked until `CI Gate` is
   green) and a docs-only PR (mergeable once `Docs Gate` and `CI Gate` are
   green).

### Deliberate choices to re-confirm before applying

- **`strict_required_status_checks_policy: false`.** `true` would additionally
  require every PR branch to be up to date with `main` before merge, which
  serialises the sprint-runner's merge queue and forces a rebase + full re-run
  per merge. Off unless merge-order races start mattering.
- **`bypass_actors: []`.** Matches the current live ruleset. A bypass actor
  re-opens the exact hole this closes. Recoverability does not need one: a
  repository admin can always edit or delete a ruleset (Settings → Rules, or
  `gh api -X PUT repos/.../rulesets/11350451`), so a wedged gate is a
  two-minute fix, not a lockout.
- **Required status checks apply to direct pushes too.** `release-please.yml`
  triggers on `push` to `main` but only opens PRs and tags releases; it does
  not push commits to `main`. Re-check that if a future workflow starts
  committing directly.
- **`do_not_enforce_on_create: false`.** Branch creation is not a merge path
  here; leaving enforcement on is the stricter default.
