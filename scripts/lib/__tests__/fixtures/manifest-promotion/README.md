# manifest-promotion fixtures (#1763)

`written-38264180225.jsonl` — 26 lines recorded from the real run manifest
`gs://toast-stats-data-staging/runs/38264180225/written.jsonl` (a `rebuild`
of 2026-10-11, the first run that published one, #1762), read with
`gcloud storage cat` on 2026-10-12. The full file has 2 914 lines; this keeps
one or a few of every path family it contains (dated snapshot files and
analytics, time-series, v1/ including rank-history, config/, the internal
stores club-trends/, club-race/ and district-awards-history.json, and the
staging-only identity histories under derived/). Lines are unedited.
