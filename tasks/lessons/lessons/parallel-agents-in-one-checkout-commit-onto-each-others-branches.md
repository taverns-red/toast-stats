---
date: 2026-08-31
tier: lesson
summary: Two agents working in the SAME checkout silently stack commits onto each other's branches — `git add -A` sweeps the other's files and a foreign `git checkout` moves your HEAD mid-task, so the isolation has to be a worktree, not a branch
tags: [git, worktree, parallel-agents, process, commit-hygiene]
---

# Parallel agents in one checkout commit onto each other's branches

**Date:** 2026-08-31
**Issue:** #1475 (Club Growth checkpoint hook), observed against #1465, #1419, #1474

## What happened

Three sessions were working on `/Users/rservant/code/toast-stats` at once. One
of them (#1474) had its own worktree. The rest — this one included — branched
inside the shared checkout, which felt sufficient: different branches, different
files, no overlap in scope.

Two commits later my branch had a stranger's file in it, and my second commit
had landed on **someone else's branch**:

```
6cdcc9b7 feat(frontend): … checkpoint counts …          (#1475)  ← mine
df958911 test(collector): … district set for date …     (#1465)  ← theirs
1df86aab feat(frontend): … newCharteredClubs …          (#1475)  ← mine
0d8c6a0b test(monitor): … closing-registry staleness …  (#1419)  ← theirs
```

Two independent mechanisms, both silent:

- **`git add -A` stages the whole tree, including the other session's
  in-flight edits.** My "add the rankings field" commit shipped
  `scripts/lib/registryFreshness.ts`, a file from #1419 I had never opened.
- **A `git checkout` by another session moves the shared HEAD under you.**
  Between my two commits, #1465's session checked out its branch. `git commit`
  from my session then wrote onto *their* branch — no warning, because from
  git's point of view nothing unusual happened.

By the time it was noticed, #1465 had committed on top of my commit, so the
foreign commits were buried mid-history in an active branch and could not be
safely rewritten. The recovery was one-way: extract my four files with
`git show <sha>:<path>`, `git worktree add -b <branch> … origin/main`, replay
them there, and leave the contaminated branch for its owner.

## The transferable lesson

**A branch is not an isolation boundary; a working tree is.** Branch names
partition *history*, but two sessions in one checkout share exactly the things
that decide what a commit contains: the index, the working tree, and HEAD. Any
of the three moving under you is invisible in the command you are running.

## How to apply

- If any other session might touch this repo, work in
  `git worktree add -b <branch> <path> origin/main` before the first edit — not
  after the first surprise. Run `npm install` in it (workspace packages resolve
  per-tree) and rebuild `dist/` (R16).
- **Never `git add -A` / `git commit -a` in a shared checkout.** Stage the paths
  you touched, by name. It is the only form that is honest about scope.
- Verify the target before every commit, not just the first:
  `git branch --show-current` and `git status --short`. A branch you did not
  switch to is the signal.
- Read `git show --stat` on your own commit afterwards. A file you cannot
  account for means the tree was not yours alone.
- `git worktree list` names every tree in play, and `git reflog` reconstructs
  who moved HEAD when — both were what turned "why is my commit missing" into
  a five-minute diagnosis.
- When foreign commits are already buried under an active session's later work,
  **do not rewrite their branch**. Rebuild yours from `origin/main` and report
  the contamination; a `reset` under a live session destroys work that no
  reflog of yours can restore.
