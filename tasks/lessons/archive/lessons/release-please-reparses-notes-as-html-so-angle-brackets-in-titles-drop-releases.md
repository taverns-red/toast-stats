---
date: 2026-10-19
tier: lesson
category: lesson
summary: release-please re-parses release notes as HTML, so a `<word>` in a squash subject silently drops or overflows component releases
tags: [release-please, ci, deploy, release]
---

# release-please re-parses notes as HTML: no `<word>` in PR titles

**Issue:** #2185

A squash subject like `snapshots/<date>/x.json` is escaped to `&lt;date&gt;` in
the release PR body. On merge, release-please 17.x parses the body with
node-html-parser, takes each `<details>` block's `textContent` (which decodes
the entity), re-renders, and parses again. The second time `<date>` is an
unclosed element, so it swallows every later component's block.

- 2.62.0: the root swallowed everything. Only `toast-stats-v2.62.0` was
  released, and nothing failed.
- 2.63.0: frontend swallowed the rest (141,488 chars). GitHub rejected it
  (125,000 max), the job failed and deploy never ran.

**Takeaway:** treat a changelog line as HTML input to a lossy round-trip. Write
`{date}` and never `<date>`. CI Gate now enforces this on the PR title. When a
multi-component release is missing components, look for "Pull request contains
releases, but not for component" in the release-please log before you blame
size.
