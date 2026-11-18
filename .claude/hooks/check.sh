#!/usr/bin/env bash
# Stop hook: if the turn touched code, tests or translations, check types and tests before stopping.
# If something fails it exits with 2: Claude gets the error and keeps working to fix it.
input=$(cat)

# The turn is already continuing because of this hook: don't block again (no loops).
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# No changes since the last commit in the files that matter: nothing to check.
git status --porcelain -- src entrypoints tests public/_locales wxt.config.ts vitest.config.ts tsconfig.json package.json \
  | grep -q . || exit 0

if ! out=$(npx tsc --noEmit 2>&1); then
  printf 'tsc --noEmit fails:\n%s\n' "$(printf '%s' "$out" | tail -40)" >&2
  exit 2
fi

if ! out=$(npx vitest run 2>&1); then
  printf 'vitest run fails:\n%s\n' "$(printf '%s' "$out" | grep -E 'FAIL|✗|×|Error|expected|received|Test Files|Tests ' | tail -40)" >&2
  exit 2
fi

exit 0
