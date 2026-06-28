---
name: author-runner-ready-sprint
description: Template a self-contained, TDD-ready sprint issue an autonomous session can ship without asking questions. Use before queueing work. Produces the problem, the exact change set with file:line, acceptance criteria, and a relevant-lessons manifest; hand the result to barkeep-queue.
---

# author-runner-ready-sprint

A runner session has fresh context and no one to ask. A sprint issue is
"runner-ready" only if a cold session can ship it from the body alone. Use this
shape.

## The sprint body template

```markdown
## Problem

<one paragraph: the observable pain / failure, with evidence>

## Change set (exact)

- `path/to/file.ext:LINE` — <what changes and why>
- `path/to/test.ext` — <the failing test to add first>
  <keep the blast radius small: ideally ≤3 files; if more, it's probably 2 sprints>

## Acceptance criteria

- [ ] <falsifiable, checkable statement>
- [ ] Failing test proven first, then green (TDD)
- [ ] Full hermetic suite passes; no regressions
- [ ] <docs/README updated if public surface changed>

## Relevant lessons

<tags or explicit lesson IDs the session must read — the per-sprint manifest the
bootstrap prompt looks for. Always-read: the 2 newest.>
```

## Rules of thumb

- **One problem, one sprint.** If acceptance criteria split cleanly into two
  themes, file two sprints.
- **Name the failing test.** TDD starts red; the body should say what "red" is.
- **No `Closes #N`.** Closing is the runner's gated handshake, not GitHub
  auto-close (the queue tooling enforces this).
- **Cite file:line.** A cold session shouldn't have to hunt.

## Then queue it

Hand the epic + these sprint bodies to **`barkeep-queue`** (or the `queue-work`
skill) — it creates and links the issues and writes a validated META_EPIC line.
Don't hand-create the issues and hand-edit the META_EPIC; that's the error-prone
ritual this avoids.
