#!/usr/bin/env bash
# Exit-code contract test for tools/apply-rtl-patch.sh (review I3/I4).
# Uses only nonexistent/garbage paths — never touches /Applications.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH="$REPO_ROOT/tools/apply-rtl-patch.sh"
failures=0

expect_code() {
  local want="$1"; shift
  local got
  set +e
  bash "$PATCH" "$@" >/dev/null 2>&1
  got=$?
  set -e
  if [ "$got" != "$want" ]; then
    echo "FAIL: [$*] exit=$got (want $want)"
    failures=$((failures + 1))
  fi
}

expect_code 2 --source /nonexistent-source-xyz --target /tmp/rtl-nope-xyz --no-launch
expect_code 2 --source
expect_code 2 --source /nonexistent-source-xyz --target / --no-launch
expect_code 2 --source /nonexistent-source-xyz --target /Applications --no-launch

if [ "$failures" != "0" ]; then
  echo "CLI-EXIT-CODE FAILURES: $failures"
  exit 1
fi
echo "CLI-EXIT-CODES PASS"
