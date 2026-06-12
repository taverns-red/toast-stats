#!/usr/bin/env bash
# npm-pack smoke (#1163): prove the PUBLISHED artifact boots.
#
# Packs the package exactly as `npm publish` would, installs the tarball into
# a clean temp dir (runtime deps resolve from the public registry — the
# workspace contracts package must NOT be needed), then runs the offline
# stdio-boot smoke against the *installed* bin via TOAST_STATS_MCP_BIN.
#
# All diagnostics go to stderr (R4).
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR=""

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
  return 0 # R13: never let a conditional be the trap's last status
}
trap cleanup EXIT

cd "$PACKAGE_ROOT"

# No explicit build here: the manifest's `prepack` hook rebuilds (tsc +
# esbuild bundle) inside `npm pack` itself, so the tarball can never ship a
# stale dist/bin.js — including a bare `npm pack`/`npm publish` outside this
# script.

# Portable mktemp: GNU (ubuntu CI) requires an explicit XXXXXX template; BSD
# (macOS) accepts it too. `-t prefix` is BSD-only and dies on Linux.
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/toast-stats-mcp-pack-smoke.XXXXXX")"
echo "[pack-smoke] packing into $TMP_DIR ..." >&2
# Derive the tarball name from npm itself and the bin path from the manifest,
# so a future rename only ever touches package.json.
TARBALL_FILE="$(npm pack --pack-destination "$TMP_DIR" --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)[0].filename))")"
TARBALL="$TMP_DIR/$TARBALL_FILE"
echo "[pack-smoke] tarball: $TARBALL" >&2
tar -tzf "$TARBALL" >&2

echo "[pack-smoke] installing the tarball into a clean dir..." >&2
INSTALL_DIR="$TMP_DIR/install"
mkdir -p "$INSTALL_DIR"
(
  cd "$INSTALL_DIR"
  npm init -y >/dev/null 2>&1
  npm install --no-audit --no-fund "$TARBALL" >&2
)

PKG_NAME="$(node -p "require('$PACKAGE_ROOT/package.json').name")"
BIN_REL="$(node -p "Object.values(require('$PACKAGE_ROOT/package.json').bin)[0]")"
INSTALLED_BIN="$INSTALL_DIR/node_modules/$PKG_NAME/${BIN_REL#./}"
if [[ ! -f "$INSTALLED_BIN" ]]; then
  echo "[pack-smoke] FAIL: installed bin not found at $INSTALLED_BIN" >&2
  exit 1
fi

echo "[pack-smoke] booting the installed bin over stdio (offline smoke)..." >&2
TOAST_STATS_MCP_BIN="$INSTALLED_BIN" npx vitest run \
  src/__tests__/stdio-boot.smoke.test.ts

echo "[pack-smoke] PASS: the published artifact boots from a clean install" >&2
