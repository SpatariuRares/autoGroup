#!/usr/bin/env bash
# Stop hook: se il turno ha toccato codice, test o traduzioni, controlla tipi e test prima di chiudere.
# Se qualcosa fallisce esce con 2: Claude riceve l'errore e continua a lavorare per correggerlo.
input=$(cat)

# Il turno sta già continuando per colpa di questo hook: non bloccare di nuovo (niente cicli).
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Nessuna modifica rispetto all'ultimo commit nei file che contano: niente da controllare.
git status --porcelain -- src entrypoints tests public/_locales wxt.config.ts vitest.config.ts tsconfig.json package.json \
  | grep -q . || exit 0

if ! out=$(npx tsc --noEmit 2>&1); then
  printf 'tsc --noEmit fallisce:\n%s\n' "$(printf '%s' "$out" | tail -40)" >&2
  exit 2
fi

if ! out=$(npx vitest run 2>&1); then
  printf 'vitest run fallisce:\n%s\n' "$(printf '%s' "$out" | grep -E 'FAIL|✗|×|Error|expected|received|Test Files|Tests ' | tail -40)" >&2
  exit 2
fi

exit 0
