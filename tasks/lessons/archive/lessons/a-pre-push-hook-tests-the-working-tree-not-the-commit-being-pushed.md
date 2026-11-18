---
date: 2026-10-11
tier: lesson
summary: A pre-push hook tests the working tree, not the commit being pushed — never switch branches or edit files while a detached push runs
tags: [git, hooks, tests, worktree, automation]
---

# A pre-push hook tests the working tree, not the commit being pushed

**Date:** 2026-10-11
**Issue:** #1782 / #1820 (epic #1781)

## What happened

The pre-push hook runs the full frontend unit suite (about 7 minutes), so the push of `feat/1782-club-district-history` was started detached with `nohup`. While it ran, the same worktree was switched to a new branch for #1820 and an uncommitted schema file was added there. The hook's `programYearRuleChangeLog` drift guard scans the files on disk. It found that #1820 file and failed, and the #1782 push was rejected even though the #1782 commits were clean.

## The transferable lesson

**A git hook sees the checkout as it is when the hook runs, not the refs being pushed.** While a long hook is running, the working tree belongs to the push: don't check out another branch, write files, or rebuild `dist/`. If you need to keep working in parallel, use a second worktree, or draft the files in a scratch directory and copy them in after the push finishes. A hook failure that names a file which isn't in the pushed commits means the tree was contaminated, not that the code has a bug.

## How to apply

- Before you start a detached push, make sure `git status` is clean and the branch you want to push is checked out. Then leave the worktree alone until the push log shows `->` or `rejected`.
- Wait with an `until grep -qE "\->|rejected|failed" push.log` loop instead of interleaving other edits.
