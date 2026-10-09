#!/usr/bin/env bash
# Pull district-awards-history.json from GCS, fail-closed (#1704).
#
# Usage: scripts/pull-awards-history.sh <bucket> [dest]
#
# TransformService loads this store and computes Club Strength and Leadership
# Excellence from it, so it must be pulled BEFORE any transform. A missing
# object (first run) is fine: the store starts empty. Any other failure (auth,
# transport, missing bucket) stops the run; treating it as "first run" would
# compute awards from no history and push the empty store over the real one.
set -euo pipefail

BUCKET="${1:?usage: pull-awards-history.sh <bucket> [dest]}"
DEST="${2:-./cache/district-awards-history.json}"
SRC="gs://${BUCKET}/district-awards-history.json"

mkdir -p "$(dirname "${DEST}")"

if ERR=$(gcloud storage cp "${SRC}" "${DEST}" 2>&1); then
  echo "Pulled ${SRC}" >&2
  exit 0
fi

# Text printed by `gcloud storage cp` for an absent object (SDK 583.0.0).
if grep -q 'matched no objects or files' <<<"${ERR}"; then
  echo "No ${SRC} yet (first run); the store starts empty" >&2
  exit 0
fi

echo "${ERR}" >&2
echo "::error::Failed to pull ${SRC}; refusing to transform without awards history (#1704)" >&2
exit 1
