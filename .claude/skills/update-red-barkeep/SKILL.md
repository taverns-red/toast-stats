---
name: update-red-barkeep
description: Update this repo's vendored Red Barkeep toolkit to the latest upstream version. Use when a consumer is on an older Red Barkeep and you want the newest orchestrator, scripts, and skills. Propose-then-apply and fail-closed — shows the CHANGELOG delta and confirms before mutating, then verifies the version stamp advanced.
---

# update-red-barkeep

Bring this consumer's vendored Red Barkeep up to the latest upstream **safely**:
detect drift, propose the change (CHANGELOG delta), apply on confirmation, and
verify — never reporting an update you didn't confirm.

## When to use

- This repo has a `.red-barkeep-version` and you suspect it's behind upstream.
- After a Red Barkeep release, to pull the new orchestrator/scripts/skills.

## How

The mechanics live in **`prompts/red-barkeep-update.prompt`** and in
**`setup.sh`** — this skill orchestrates them:

1. **Detect drift (local, no network):**
   `<RB>/scripts/setup.sh --check-version --target-dir <CONSUMER>`
   (exit 0 current · 10 behind · 20 ahead). `<RB>` is a checkout of
   `taverns-red/red-barkeep` — pull it first so you're comparing to the real
   latest; `<CONSUMER>` is this repo.
2. **Propose:** if behind, show the version diff (`.red-barkeep-version` →
   upstream `VERSION`) and the `CHANGELOG.md` delta since the installed version.
   **Confirm before mutating.**
3. **Apply:** `<RB>/scripts/setup.sh --repo <slug> --target-dir <CONSUMER> --update`
   — refreshes the toolkit (orchestrator, libs, `barkeep-queue`, skills
   copy-if-absent) and re-stamps the version.
4. **Verify (fail closed):** re-run `--check-version`; the stamp MUST report
   `current` and the semver MUST have advanced. If not, STOP and report an honest
   failure — do not claim success.

Follow `prompts/red-barkeep-update.prompt` for the exact step list. If you can't
obtain the upstream `<RB>` checkout, STOP — don't fake an update.

## Why propose-then-apply

Updating rewrites vendored runner code. Surfacing the CHANGELOG delta first lets
the operator catch a breaking change (e.g. a shared-contract invariant the
consumer's customized bootstrap prompt must re-sync) before it lands.
