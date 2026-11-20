#!/usr/bin/env bash
# scan-secrets.sh - detect likely credentials in files before they are committed.
#
# Usage:
#   scripts/scan-secrets.sh              # scan staged files (pre-commit mode)
#   scripts/scan-secrets.sh --all       # scan all tracked files
#   scripts/scan-secrets.sh <path...>    # scan specific paths
#
# Exit codes: 0 = clean, 1 = secrets found.
# Bypass (only if verified safe): SKIP_SECRET_SCAN=1 git commit ...

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PATTERN_FILE="$SCRIPT_DIR/secret-patterns.txt"

if [ ! -f "$PATTERN_FILE" ]; then
  echo "ERROR: pattern file missing: $PATTERN_FILE" >&2
  exit 2
fi

GREP_ARGS=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  case "$line" in \#*) continue;; esac
  GREP_ARGS+=(-e "$line")
done < "$PATTERN_FILE"

if [ "${#GREP_ARGS[@]}" -eq 0 ]; then
  echo "ERROR: no patterns loaded" >&2
  exit 2
fi

collect() {
  if [ "${1:-}" = "--all" ]; then
    git ls-files -z | xargs -0 grep -IEn "${GREP_ARGS[@]}" 2>/dev/null
  elif [ "$#" -gt 0 ]; then
    grep -IEn "${GREP_ARGS[@]}" "$@" 2>/dev/null
  else
    git diff --cached --name-only --diff-filter=ACM -z | xargs -0 grep -IEn "${GREP_ARGS[@]}" 2>/dev/null
  fi
}

# A line is SAFE if it contains a redaction marker or a placeholder value.
# REPLACED with a plain space so the whole line is excluded, not just the marker.
SAFE_MARKER='(\[REDACTED[^]]*\]|\[REMOVED[^]]*\]|\[MASKED[^]]*\]|\*\*\*|REDACTED|MASKED|xxxxx|xxxx|xxx+|XXX+|your[_-]?|YOUR[_-]?|example|EXAMPLE|placeholder|PLACEHOLDER|CHANGEME|changeme|<[a-z_]+>|\.\.\.|:password@|:password\?|password@|\$\{[^}]*\})'

hits=$(collect "$@" | grep -vE "$SAFE_MARKER")

if [ -n "$hits" ]; then
  echo "BLOCKED: possible secret(s) detected:"
  echo "$hits"
  echo ""
  echo "Fix before committing:"
  echo "  - store the value in the protected secrets store and reference it"
  echo "  - replace with a placeholder like [REDACTED_NAME]"
  echo "  - if a genuine false positive, confirm with the operator"
  exit 1
fi

echo "secret scan: clean"
exit 0
