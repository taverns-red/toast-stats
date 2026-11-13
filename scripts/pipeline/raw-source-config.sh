#!/usr/bin/env bash
# Where the pipeline keeps its raw sources (#2695). Sourced, not run.
#
# Raw sources (`raw-fac/`, `raw-education-ledger/`) live in a private bucket,
# never in the staging bucket. Every writer and reader of those prefixes
# takes the bucket from here. RAW_SOURCE_BUCKET overrides it (tests).
RAW_SOURCE_BUCKET="${RAW_SOURCE_BUCKET:-toast-stats-raw-private}"
export RAW_SOURCE_BUCKET
