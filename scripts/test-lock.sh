#!/bin/sh
# One local toast-stats test run at a time.
# Usage: scripts/test-lock.sh <command> [args...]
#
# Takes the ops test-slot wrapper with this repo's own lock folder and a limit
# of 1. Without the wrapper (CI, cloud) it runs the command directly.
# Enforced by scripts/lib/__tests__/testLock.test.ts.
# Never wrap this script in run.sh by hand: that takes a machine slot before
# the repo lock, the reverse of the pre-push hook's order, and enough such
# callers deadlock until the 20-minute timeout. Call it directly. No test
# enforces this; CLAUDE.md states the order.
if [ $# -eq 0 ]; then
  echo "usage: scripts/test-lock.sh <command> [args...]" >&2
  exit 64
fi
SLOT="${TOAST_TEST_SLOT_RUN:-$HOME/code/ops/tools/test-slot/run.sh}"
if [ ! -x "$SLOT" ]; then
  exec "$@"
fi
# ops#428: run.sh skips its lock when RT_TEST_SLOT_HELD names a live holder.
# Unset it for the repo lock so that lock is never skipped, then hand the
# caller's held slot back to the command so its own machine slot still counts.
# Enforced by the "always takes the repo lock" case in testLock.test.ts.
OUTER_HELD="${RT_TEST_SLOT_HELD:-}"
exec env -u RT_TEST_SLOT_HELD RT_TEST_SLOT_DIR="$HOME/.cache/toast-stats-test-lock" RT_TEST_SLOT_MAX=1 \
  "$SLOT" env -u RT_TEST_SLOT_DIR -u RT_TEST_SLOT_MAX RT_TEST_SLOT_HELD="$OUTER_HELD" "$@"
