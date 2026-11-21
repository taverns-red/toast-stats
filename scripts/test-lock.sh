#!/bin/sh
# One local toast-stats test run at a time.
# Usage: scripts/test-lock.sh <command> [args...]
#
# Takes this repo's lock (own folder, limit 1) first, then a machine slot, then
# runs the command, so the order cannot be reversed by the caller. Without the
# ops wrapper (CI, cloud) it runs the command directly.
# Enforced by scripts/lib/__tests__/testLock.test.ts.
#
# Re-entrant: run.sh passes a nested call through when its caller holds a slot
# in the same folder (ops#430), so the pre-push hook can call this script under
# a caller's own `scripts/test-lock.sh git push` without waiting on itself.
if [ $# -eq 0 ]; then
  echo "usage: scripts/test-lock.sh <command> [args...]" >&2
  exit 64
fi
SLOT="${TOAST_TEST_SLOT_RUN:-$HOME/code/ops/tools/test-slot/run.sh}"
if [ ! -x "$SLOT" ]; then
  exec "$@"
fi
exec env RT_TEST_SLOT_DIR="$HOME/.cache/toast-stats-test-lock" RT_TEST_SLOT_MAX=1 \
  "$SLOT" env -u RT_TEST_SLOT_DIR -u RT_TEST_SLOT_MAX "$SLOT" "$@"
