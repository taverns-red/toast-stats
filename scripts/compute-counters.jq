# Sum the store write counters of one or more `compute-analytics` JSON outputs
# into step-summary lines (#1708). Run with `jq -rs -f`: the input is slurped,
# so it takes a single output (daily) or a JSONL of per-date outputs (rebuild,
# rescrape, rescrape-historical). An output without counters (a crash, an
# older CLI) counts as zero rather than failing the summary.
def total(store; field): map(.[store][field] // 0) | add // 0;
"- **Time-series points**: \(total("timeSeries"; "written")) written, \(total("timeSeries"; "failed")) failed",
"- **Club-trends stores**: \(total("clubTrends"; "written")) written, \(total("clubTrends"; "failed")) failed",
"- **Club-race store**: \(total("clubRace"; "written")) written, \(total("clubRace"; "failed")) failed"
