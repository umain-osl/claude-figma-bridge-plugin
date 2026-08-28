#!/usr/bin/env bash
# Exercises the vendored checks against a throwaway copy of tests/fixture.
#
# Every case here is a failure the checks were written for after it happened in a real repo, so
# each one asserts both directions: the clean fixture passes, and the specific mutation fails
# with the message that explains it.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CLI="$HERE/../scripts/figma-bridge/cli.mjs"
FIXTURE="$HERE/fixture"

pass=0
fail=0

# expect <name> <expected-exit> <expected-substring> -- <command...>
expect() {
  local name="$1" want_code="$2" want_text="$3"
  shift 4
  local out code
  out="$("$@" 2>&1)"
  code=$?
  if [[ "$code" == "$want_code" && "$out" == *"$want_text"* ]]; then
    pass=$((pass + 1))
    printf '  ok    %s\n' "$name"
  else
    fail=$((fail + 1))
    printf '  FAIL  %s\n        wanted exit %s containing %q\n        got exit %s:\n%s\n' \
      "$name" "$want_code" "$want_text" "$code" "$out"
  fi
}

# Each case runs in its own copy, so a mutation cannot leak into the next one.
work() {
  local dir
  dir="$(mktemp -d)"
  cp -R "$FIXTURE/." "$dir/"
  printf '%s' "$dir"
}

echo
echo "figma-bridge — fixture checks"
echo

dir="$(work)"; ( cd "$dir" && node "$CLI" check ) >/dev/null 2>&1
expect "clean fixture passes check" 0 "All checks pass" -- \
  bash -c "cd '$dir' && node '$CLI' check"
rm -rf "$dir"

dir="$(work)"
cat > "$dir/src/ds/Invented.tsx" <<'EOF'
export function Invented() {
  return null;
}
EOF
expect "invented component fails coverage" 1 "Invented  (src/ds/Invented.tsx)" -- \
  bash -c "cd '$dir' && node '$CLI' audit-coverage"
expect "invented component trips the post-write guard" 2 "no Figma counterpart" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"file_path\":\"$dir/src/ds/Invented.tsx\"}}' | node '$CLI' guard --post-write"
rm -rf "$dir"

dir="$(work)"; rm "$dir/src/ds/Separator.tsx"
expect "declaration for a deleted file is reported stale" 1 "Declared but no longer present" -- \
  bash -c "cd '$dir' && node '$CLI' audit-coverage"
rm -rf "$dir"

dir="$(work)"; sed -i.bak 's/node-id=1-1/node-id=9-9/g' "$dir/src/ds/Button.figma.ts"
expect "mapping onto a retired page fails coverage" 1 "Old Button (Graveyard)" -- \
  bash -c "cd '$dir' && node '$CLI' audit-coverage"
rm -rf "$dir"

dir="$(work)"
sed -i.bak "s|, \"import { ButtonVariant } from '@/ds/types';\"||" "$dir/src/ds/Button.figma.ts"
expect "snippet referencing an unimported identifier fails" 1 "does not import: ButtonVariant" -- \
  bash -c "cd '$dir' && node '$CLI' audit-snippets"
expect "the same fault trips the post-write guard" 2 "does not import" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"file_path\":\"$dir/src/ds/Button.figma.ts\"}}' | node '$CLI' guard --post-write"
rm -rf "$dir"

dir="$(work)"
sed -i.bak "s|'@/ds/types'|'./types'|" "$dir/src/ds/Button.figma.ts"
expect "relative import in a snippet fails" 1 "relative import" -- \
  bash -c "cd '$dir' && node '$CLI' audit-snippets"
rm -rf "$dir"

dir="$(work)"
sed -i.bak 's/abcdefghijklmnopqrstuv\/Fixture-Library/zzzzzzzzzzzzzzzzzzzzzz\/Other/' "$dir/src/ds/Button.tsx"
expect "a doc link naming another file fails the target check" 1 "point somewhere other than the target" -- \
  bash -c "cd '$dir' && node '$CLI' retarget --check"
rm -rf "$dir"

dir="$(work)"
sed -i.bak 's/"abcdefghijklmnopqrstuv", "fetchedAt"/"zzzzzzzzzzzzzzzzzzzzzz", "fetchedAt"/' "$dir/design/figma/components.meta.json"
sed -i.bak 's/"fileKey": "abcdefghijklmnopqrstuv"/"fileKey": "zzzzzzzzzzzzzzzzzzzzzz"/' "$dir/design/figma/components.meta.json"
expect "a cache from another file fails the target check" 1 "component cache came from" -- \
  bash -c "cd '$dir' && node '$CLI' retarget --check"
rm -rf "$dir"

dir="$(work)"
expect "retarget rewrites every reference" 0 "Retargeted" -- \
  bash -c "cd '$dir' && node '$CLI' retarget zzzzzzzzzzzzzzzzzzzzzz 'Other Library'"
expect "…and the rewrite is consistent" 0 "Every reference agrees with the target" -- \
  bash -c "cd '$dir' && sed -i.bak 's/\"fileKey\": \"abcdefghijklmnopqrstuv\"/\"fileKey\": \"zzzzzzzzzzzzzzzzzzzzzz\"/' design/figma/components.meta.json && node '$CLI' retarget --check"
rm -rf "$dir"

dir="$(work)"; printf '{ "designSystem": { "name": "x" } }' > "$dir/figma-bridge.json"
expect "a malformed config reports the field, not a stack trace" 1 "designSystem.roots: is required" -- \
  bash -c "cd '$dir' && node '$CLI' audit-coverage"
rm -rf "$dir"

dir="$(work)"; sed -i.bak 's|"src/ds"|"src/nope"|' "$dir/figma-bridge.json"
expect "a root that does not exist is named" 1 "src/nope" -- \
  bash -c "cd '$dir' && node '$CLI' audit-coverage"
rm -rf "$dir"

dir="$(work)"
expect "the write guard denies another file" 0 '"permissionDecision":"deny"' -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"fileKey\":\"zzzzzzzzzzzzzzzzzzzzzz\"}}' | node '$CLI' guard --pre-write"
expect "the write guard denies a call with no fileKey" 0 "Refused fileKey: none" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{}}' | node '$CLI' guard --pre-write"
expect "the write guard permits the target" 0 "" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"fileKey\":\"abcdefghijklmnopqrstuv\"}}' | node '$CLI' guard --pre-write"
rm -rf "$dir"

# The plugin is installed globally, so the guards must be silent in a repo that has no config.
dir="$(mktemp -d)"
expect "the write guard ignores an unconfigured repo" 0 "" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"fileKey\":\"zzzzzzzzzzzzzzzzzzzzzz\"}}' | node '$CLI' guard --pre-write"
expect "the post-write guard ignores an unconfigured repo" 0 "" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"file_path\":\"$dir/x.tsx\"}}' | node '$CLI' guard --post-write"
rm -rf "$dir"

echo
echo "$pass passed, $fail failed"
[[ "$fail" == 0 ]]
