---
name: queue-work
description: Author and queue an epic + its sprint(s) onto a Red Barkeep META_EPIC reliably. Use when adding new work for the autonomous runner to pick up. Delegates the mechanics to barkeep-queue so the queued line is always pickable.
---

# queue-work

Queue an epic and its sprint(s) so the runner will pick them up — without the
~25% hand-error rate of the manual ritual. **You own the judgment** (what the
epic/sprints should be); **`barkeep-queue` owns the mechanics** (create, link,
write a _validated_ line, decision-log, idempotency).

## When to use

- Adding a new epic + sprints to an existing META_EPIC roadmap.
- You want the runner to start on new work and must not write an unpickable line.

## Steps

1. **Decide the work.** One epic, one clear theme; sprints are self-contained,
   single-session units (see the `author-runner-ready-sprint` skill for the
   sprint body shape).
2. **Sanity-check the epic title.** A `*` (or other `**`-breaking char) in the
   title silently makes the epic unpickable. You don't have to remember this —
   `barkeep-queue` validates before it mutates anything — but prefer plain
   titles.
3. **Run the queue script** (it re-queries the META_EPIC, creates the epic +
   sprint sub-issues, GraphQL-links them, writes a validated `Epics` line, and
   posts a decision-log comment):

   ```sh
   scripts/barkeep-queue --repo <owner/name> --meta-epic <#> \
     --epic-title "<epic title>" \
     --sprint-title "<sprint 1 title>" [--sprint-title "<sprint 2 title>" ...]
   ```

   Add `--dry-run` first to preview without mutating.

4. **Trust the refusal.** If the script refuses (e.g. "unpickable line"), fix the
   input it names — do NOT hand-edit the META_EPIC to force the line in. The
   refusal means the runner would not have picked it.
5. **Verify.** `scripts/sprint-runner.sh --validate-epic-line "<the line>"` should
   echo the epic number. The runner's next tick will pick it up.

## Guarantees barkeep-queue gives you

- The written line passes `--validate-epic-line` (the single source of truth, #28).
- Idempotent: re-running with the same epic title is a no-op (no duplicates).
- Sprint bodies carry **no `Closes #N`** — closing is the runner's gated handshake.
