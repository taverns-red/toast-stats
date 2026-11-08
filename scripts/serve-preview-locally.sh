#!/usr/bin/env bash
# Serve frontend/dist the way its PR preview channel serves it, on
# http://127.0.0.1:4173, from inside the runner (#2544).
#
# PR Preview's Playwright shards and Lighthouse routes load this instead of
# the deployed pr-<N> channel, which cut Hosting egress by ~97%. Two layers:
#   - the Firebase Hosting emulator on firebase.json's `staging` target, the
#     very config the channel deploys (headers, rewrites, clean URLs), on
#     firebase.json's `emulators.hosting` address;
#   - scripts/preview-local-server.mjs in front of it, which compresses like
#     Hosting (brotli quality 11) so the Lighthouse byte budgets measure the
#     same bytes, and drops upgrade-insecure-requests for WebKit on http.
# The build must already be in frontend/dist and `firebase` on PATH. No
# credentials: the emulator serves files only. Both processes keep running in
# the background for the rest of the job. Exits non-zero, with both logs, if
# a deep link does not come back 200 within 90 s.
set -euo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="${LOG_DIR:-${RUNNER_TEMP:-/tmp}}"
LOCAL=http://127.0.0.1:4173

if [ ! -f frontend/dist/index.html ]; then
  echo "::error::frontend/dist/index.html is missing: build or download it first"
  exit 1
fi

nohup firebase emulators:start --only hosting:staging --project default \
  > "$LOG_DIR/hosting-emulator.log" 2>&1 &
UPSTREAM=http://127.0.0.1:5050 PORT=4173 \
  nohup node scripts/preview-local-server.mjs \
  > "$LOG_DIR/preview-local-server.log" 2>&1 &

# A deep link proves the rewrite to index.html, not just a listening port.
for _ in $(seq 1 90); do
  if curl -fs -o /dev/null "$LOCAL/district/61"; then
    echo "Local preview ready on $LOCAL"
    exit 0
  fi
  sleep 1
done

echo "::error::local preview did not answer $LOCAL/district/61 within 90 s"
echo "::group::hosting emulator log"
cat "$LOG_DIR/hosting-emulator.log" || true
echo "::endgroup::"
echo "::group::preview-local-server log"
cat "$LOG_DIR/preview-local-server.log" || true
echo "::endgroup::"
exit 1
