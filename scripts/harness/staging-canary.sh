#!/usr/bin/env bash
# Read-only staging canary for the gcloud shim (#1768, ADR-015 D10).
#
# The pipeline harness runs against scripts/lib/__tests__/fixtures/gcloud-shim/
# gcloud. This script runs the REAL gcloud (the pipeline's pinned version)
# against the STAGING bucket and checks the behaviour the shim models:
#
#   1. `storage ls <prefix>/` lists one level, sub-prefixes with a trailing /.
#   2. `storage ls` and `storage cat` on a missing URL fail with the texts
#      the shim prints.
#   3. `objects describe` / `objects list --format=json` carry the keys the
#      shim and the recorded fixture (gcloud-objects-list/staging-live.json)
#      use, and report Content-Encoding: gzip for a gzip object.
#   4. A download inflates exactly one gzip layer (the shim's
#      SHIM_DOWNLOAD_DECOMPRESS=1 model of gcloud >= 576, #1702) while `cat`
#      prints the stored bytes, and the shim, seeded with the same stored
#      bytes, does both the same way.
#
# Reads only: no upload, copy between buckets, delete or metadata change.
# scripts/lib/__tests__/harnessStagingCanary.test.ts scans this file and
# fails on any gcloud command that is not a read; the workflow's token is
# scoped to devstorage.read_only besides. Never names production.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SHIM="${REPO}/scripts/lib/__tests__/fixtures/gcloud-shim/gcloud"
FIXTURE="${REPO}/scripts/lib/__tests__/fixtures/gcloud-objects-list/staging-live.json"

BUCKET="gs://toast-stats-data-staging"
PREFIX="${BUCKET}/time-series/"
# A closed program year's file: small (~0.7 KB stored), gzip-encoded, stable.
OBJ="${BUCKET}/time-series/district_61/2020-2021.json"
MISSING="${BUCKET}/harness-canary-1768-does-not-exist"

TMP="$(mktemp -d)"
FAILED=0
pass() { echo "ok: $1"; }
fail() {
  echo "::error::staging canary: $1"
  FAILED=1
}
is_gzip() { [ "$(head -c 2 "$1" | od -An -tx1 | tr -d ' \n')" = "1f8b" ]; }

# 1. One-level ls.
gcloud storage ls "${PREFIX}" >"${TMP}/ls.txt"
if [ ! -s "${TMP}/ls.txt" ]; then
  fail "ls ${PREFIX} printed nothing"
elif grep -qvF "${PREFIX}" "${TMP}/ls.txt"; then
  fail "ls ${PREFIX} printed a line outside the prefix"
elif ! grep -q '/$' "${TMP}/ls.txt"; then
  fail "ls ${PREFIX} printed no sub-prefix ending in /"
elif sed "s#^${PREFIX}##" "${TMP}/ls.txt" | grep -q '/.'; then
  fail "ls ${PREFIX} went deeper than one level"
else
  pass "ls lists one level, sub-prefixes end in / ($(grep -c '/$' "${TMP}/ls.txt") of them)"
fi

# 2. Error texts on a missing URL (the shim's strings).
if gcloud storage ls "${MISSING}/" 2>"${TMP}/ls.err" >/dev/null; then
  fail "ls on a missing prefix succeeded"
elif ! grep -qF 'ERROR: (gcloud.storage.ls) One or more URLs matched no objects.' "${TMP}/ls.err"; then
  fail "ls on a missing prefix: unexpected error: $(cat "${TMP}/ls.err")"
else
  pass "ls on a missing prefix fails with the shim's text"
fi
if gcloud storage cat "${MISSING}.json" 2>"${TMP}/cat.err" >/dev/null; then
  fail "cat on a missing object succeeded"
elif ! grep -qF 'ERROR: (gcloud.storage.cat) The following URLs matched no objects or files:' "${TMP}/cat.err"; then
  fail "cat on a missing object: unexpected error: $(cat "${TMP}/cat.err")"
else
  pass "cat on a missing object fails with the shim's text"
fi

# 3. Metadata keys.
gcloud storage objects describe "${OBJ}" --format=json >"${TMP}/describe.json"
if ! jq -e '.content_encoding == "gzip" and (.size | type) == "number"' \
  "${TMP}/describe.json" >/dev/null; then
  fail "describe: want content_encoding gzip and a numeric size, got $(cat "${TMP}/describe.json")"
else
  pass "describe reports content_encoding gzip"
fi
gcloud storage objects list "${OBJ}" --format=json >"${TMP}/list.json"
missing_keys="$(jq -r --slurpfile real "${TMP}/list.json" \
  '[.[] | select(.content_encoding == "gzip")][0] | keys - ($real[0][0] | keys) | join(",")' \
  "${FIXTURE}")"
if [ "$(jq 'length' "${TMP}/list.json")" != 1 ]; then
  fail "objects list of one object returned $(jq 'length' "${TMP}/list.json") entries"
elif [ -n "${missing_keys}" ]; then
  fail "objects list no longer prints the recorded keys: ${missing_keys}"
else
  extra="$(jq -r --slurpfile rec "${FIXTURE}" \
    '.[0] | keys - ([$rec[0][] | select(.content_encoding == "gzip")][0] | keys) | join(",")' \
    "${TMP}/list.json")"
  pass "objects list prints every recorded key${extra:+ (new keys, not recorded: ${extra})}"
fi

# 4. A download inflates the one gzip layer (SHIM_DOWNLOAD_DECOMPRESS=1);
#    `cat` prints the stored bytes (observed on 588, run 40143638422).
gcloud storage cat "${OBJ}" >"${TMP}/cat.bin"
gcloud storage cp "${OBJ}" "${TMP}/download.json"
stored="$(jq '.size' "${TMP}/describe.json")"
if ! is_gzip "${TMP}/cat.bin" ||
  [ "$(wc -c <"${TMP}/cat.bin" | tr -d ' ')" != "${stored}" ]; then
  fail "cat: want the ${stored} stored gzip bytes, got $(wc -c <"${TMP}/cat.bin" | tr -d ' ') bytes"
else
  pass "cat prints the ${stored} stored gzip bytes"
fi
if is_gzip "${TMP}/download.json"; then
  fail "download: still gzip (the shim inflates one layer)"
elif ! jq -e . "${TMP}/download.json" >/dev/null 2>&1; then
  fail "download: does not parse as JSON"
elif ! gzip -dc <"${TMP}/cat.bin" | cmp -s - "${TMP}/download.json"; then
  fail "download is not the stored bytes inflated once"
else
  pass "download inflates exactly one gzip layer and parses"
fi

# The shim, seeded with the real stored bytes, must do what the real CLI did.
SHIM_ROOT="${TMP}/shim"
rel="${OBJ#gs://}"
mkdir -p "$(dirname "${SHIM_ROOT}/${rel}")" "$(dirname "${SHIM_ROOT}/.meta/${rel}")"
cp "${TMP}/cat.bin" "${SHIM_ROOT}/${rel}"
printf 'content-encoding=gzip\ncontent-type=application/json\n' >"${SHIM_ROOT}/.meta/${rel}"
shim() { SHIM_ROOT="${SHIM_ROOT}" SHIM_DOWNLOAD_DECOMPRESS=1 "${SHIM}" storage "$@"; }
shim cat "${OBJ}" >"${TMP}/shim-cat.bin"
shim cp "${OBJ}" "${TMP}/shim-download.json" 2>/dev/null
shim objects describe "${OBJ}" --format=json >"${TMP}/shim-describe.json"
for pair in "cat:cat.bin:shim-cat.bin" "download:download.json:shim-download.json"; do
  IFS=: read -r what real mine <<<"${pair}"
  if cmp -s "${TMP}/${real}" "${TMP}/${mine}"; then
    pass "the shim's ${what} matches the real ${what}"
  else
    fail "the shim's ${what} differs from the real ${what}"
  fi
done
shim_only="$(jq -r --slurpfile real "${TMP}/describe.json" 'keys - ($real[0] | keys) | join(",")' \
  "${TMP}/shim-describe.json")"
if [ -n "${shim_only}" ]; then
  fail "the shim's describe prints keys the real one does not: ${shim_only}"
else
  pass "the shim's describe keys are a subset of the real ones"
fi

rm -rf "${TMP}"
if [ "${FAILED}" != 0 ]; then
  echo "::error::staging canary: the shim's model of the CLI no longer holds; see above"
  exit 1
fi
echo "staging canary: every shim assumption held"
