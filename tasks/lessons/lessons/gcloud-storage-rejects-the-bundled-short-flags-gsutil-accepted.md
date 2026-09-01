---
date: 2026-09-01
tier: lesson
summary: '`gcloud storage cp -rZ` exits 2 — gcloud has no short-flag bundling, so a gsutil rewrite must split every combined flag'
tags: [gcs, gsutil, gcloud, bash, ci, pipeline, migration, cli]
---

# `gcloud storage` rejects the bundled short flags gsutil accepted

## What happened

Migrating 73 `gsutil` call sites to `gcloud storage` (#1412) looked like a pure
find-and-replace of the command name plus a flag rename (`-h "K:V"` →
`--content-type=` / `--cache-control=`, drop `-m`). Running the rewritten
commands against the real staging bucket found one shape that does not survive
the rename:

```bash
gsutil       cp -rZ ./cache/time-series/* gs://bucket/time-series/   # works
gcloud storage cp -rZ ./cache/time-series/* gs://bucket/time-series/ # exit 2
gcloud storage cp -r -Z ./cache/time-series/* gs://bucket/time-series/ # works
```

gsutil uses `getopt`, which bundles short flags. `gcloud` uses Python argparse,
which does not: `-rZ` is read as one unknown flag and the command dies with a
usage error before touching a byte.

## Why it matters more than a typo

This is the *good* failure — loud and immediate. What makes it worth a lesson is
where it sat: five of the seven bundled sites were the **snapshot and
time-series uploads**, the last step of the daily pipeline. A rewrite that
shipped on a green YAML lint and a passing test suite would have failed the
first real run, after the scrape had already happened.

The generalisation: **when you swap one CLI for another, the flags that look
identical are the dangerous ones.** A renamed flag (`-h` → `--cache-control`)
cannot be forgotten; it fails to compile in your head. A flag that is *spelled*
the same but *parsed* differently passes review.

## What to do instead

- Migrate a CLI by running each command shape against a real (scratch) target,
  not by reading the help text. `-rZ` is documented as `-r` and `-Z` in both
  tools; only execution shows one of them refuses the pair.
- Verify the **effect**, not the exit code. `gsutil` and `gcloud storage` both
  produce `Cache-Control: public, max-age=3600, must-revalidate,no-transform`
  from `-Z` plus an explicit cache header — but that had to be read back off a
  real uploaded object (`gcloud storage objects describe`, then `curl -sSI`), because
  `-Z` also *sets* `Cache-Control: no-transform` on its own and could have
  clobbered the explicit value.
- Pin the finding in a test sourced from the artefact itself. The guard in
  `scripts/lib/__tests__/gcloudStorageCli.test.ts` walks each `gcloud storage`
  invocation's flag tokens and fails on any `-[a-zA-Z]{2,}` bundle. Its first
  draft passed against a deliberately reintroduced `-rZ` — the tokenizer split
  on whitespace and stopped at `--cache-control="public,` — which is the reason
  to always re-break a new guard before trusting it.

## Corollary that was NOT true

`gcloud storage cp` refuses local→local copies ("Local copies not supported"),
which on first read looks like "gcloud does not expand local wildcards". It
does: `gcloud storage cp -r "/tmp/out/*.json" gs://bucket/dir/` copies every
match. The falsifying test (quoted local glob to a *cloud* destination) took
thirty seconds and prevented an unnecessary change to a working call site.
