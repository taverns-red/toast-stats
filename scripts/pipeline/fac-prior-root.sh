#!/usr/bin/env bash
# Validate the `fac_prior_root` dispatch input (#2239), once, for both callers:
# data-pipeline.yml's Determine-mode step (so a bad value fails the run before
# any stage) and scripts/pipeline/process-dates.sh (on the FAC_PRIOR_ROOT it
# is handed).
#
# Usage: scripts/pipeline/fac-prior-root.sh <mode> <value>
#
# The root is where a rebuild's FAC carry-forward reads each date's prior
# copy (<root>/<date>/district_*.json) instead of the live staging snapshot:
# the private recovery bucket holding the enriched generations that #2237's
# strip soft-deleted, copied out by scripts/ops/fac-recovery-2239-copy-out.sh.
# Those copies predate the #2026 contact scrub, so the root is an exact
# allowlist, never a pattern: a typo or a served bucket must not become a
# carry source.
#
# Output: the root on stdout (one line), or nothing when <value> is empty.
# Exit codes: 0 valid (or empty) · 2 a value outside rebuild mode, or any
#             value but the allowlisted root
set -euo pipefail

# The only accepted root. Remove with the recovery bucket (#2239 cleanup).
readonly ALLOWED_ROOT='gs://toast-stats-fac-recovery-2239/fac-2239'

if [ "$#" -ne 2 ]; then
  echo "usage: fac-prior-root.sh <mode> <value>" >&2
  exit 2
fi
MODE="$1"
VALUE="$2"

# R17: empty is valid in every mode and means "the live staging copy".
if [ -z "${VALUE}" ]; then
  exit 0
fi
case "${MODE}" in
  rebuild) ;;
  *)
    echo "::error::fac_prior_root is honored only in mode=rebuild, got mode '${MODE}'" >&2
    exit 2
    ;;
esac
if [ "${VALUE}" != "${ALLOWED_ROOT}" ]; then
  echo "::error::fac_prior_root must be exactly ${ALLOWED_ROOT}" >&2
  exit 2
fi
printf '%s\n' "${VALUE}"
