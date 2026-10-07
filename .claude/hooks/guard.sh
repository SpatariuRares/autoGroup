#!/usr/bin/env bash
# PreToolUse hook: impedisce di modificare a mano i file generati da npm e da WXT.
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$file" ] && exit 0

rel=${file#"${CLAUDE_PROJECT_DIR:-$PWD}"/}

case "$rel" in
  package-lock.json) reason='package-lock.json è generato da npm: cambia package.json e lancia npm install.' ;;
  .output/*) reason='.output/ è l'"'"'output di wxt build: cambia i sorgenti e ricompila.' ;;
  .wxt/*) reason='.wxt/ è generato da wxt prepare (postinstall): non va modificato a mano.' ;;
  *) exit 0 ;;
esac

jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
