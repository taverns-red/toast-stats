---
date: 2026-10-13
tier: lesson
category: lesson
summary: When several consumers classify the same codes, derive every rule from one shared vocabulary, or the first new code splits them
tags: [education, shared-contracts, vocabulary, data-pipeline]
---

# One vocabulary per code family, or consumers drift

**Issue:** #1976

Three places each had their own regex for "a Pathways level": the counted-award rule (leaderboards and the collector's members-with-award), the club page classifier, and the #1801 rollup's `educationAwardProgram`. All three said "two capitals + a digit". In April 2026 TI added the vintage path CES, which has a three-letter code. The rollup was widened when it met `CES1` in the feed. The other two were not, so the rollup counted 159 awards that the leaderboards left out.

**Takeaway:** if a second consumer needs to classify codes, have it call the first consumer's classifier (`isCountedEducationAward` now calls `educationAwardProgram`) instead of copying its pattern. Add an agreement test that runs every recorded real string through both. A new code then changes one line, or none.
