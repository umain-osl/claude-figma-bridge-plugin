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

# refute <name> <expected-exit> <substring-that-must-be-absent> -- <command...>
refute() {
  local name="$1" want_code="$2" unwanted="$3"
  shift 4
  local out code
  out="$("$@" 2>&1)"
  code=$?
  if [[ "$code" == "$want_code" && "$out" != *"$unwanted"* ]]; then
    pass=$((pass + 1))
    printf '  ok    %s\n' "$name"
  else
    fail=$((fail + 1))
    printf '  FAIL  %s\n        wanted exit %s without %q\n        got exit %s:\n%s\n' \
      "$name" "$want_code" "$unwanted" "$code" "$out"
  fi
}

# Config and cache mutations, as helpers so the expect lines stay readable.
set_design_only() {
  node -e 'const f=require("fs"),p=process.argv[1],d=JSON.parse(f.readFileSync(p,"utf8"));d.figma.designOnly=process.argv[2];f.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' \
    "$1/figma-bridge.json" "$2"
}
allow_literals_in() {
  node -e 'const f=require("fs"),p=process.argv[1],d=JSON.parse(f.readFileSync(p,"utf8"));d.tokens.allowLiteralsIn=[process.argv[2]];f.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' \
    "$1/figma-bridge.json" "$2"
}
publish_component() {
  node -e 'const f=require("fs"),p=process.argv[1],c=JSON.parse(f.readFileSync(p,"utf8"));c.push({nodeId:process.argv[2],name:process.argv[3],pageName:"Components"});f.writeFileSync(p,JSON.stringify(c,null,2)+"\n")' \
    "$1/design/figma/components.json" "$2" "$3"
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

# --- the other direction: published components with no mapping ---

dir="$(work)"
expect "unmapped published components are reported" 0 "Toggle  2:2" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
expect "…with the coverage stated" 0 "1 of 2 live component(s) mapped (50%)" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
refute "a private component is not an orphan" 0 ".baseToggleStates" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
refute "a retired component is not an orphan" 0 "Old Button" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
rm -rf "$dir"

dir="$(work)"; set_design_only "$dir" baseline
expect "baseline mode with no baseline fails" 1 "no baseline to compare against" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
expect "--write-baseline accepts the current set" 0 "Wrote 1 component(s)" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans --write-baseline"
expect "…and then the ratchet holds" 0 "Every unmapped component is in the baseline" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
# A component published after the baseline was taken is the case this mode exists
# for: coverage may stay where it is, but it may not slip.
publish_component "$dir" "4:4" "Switch"
expect "a newly published component breaks the ratchet" 1 "Switch  4:4" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
rm -rf "$dir"

dir="$(work)"; set_design_only "$dir" baseline
( cd "$dir" && node "$CLI" audit-design-orphans --write-baseline >/dev/null 2>&1 )
# Mapping a baselined component has to force the entry out, or the baseline keeps
# accepting something that is no longer unmapped.
sed -i.bak 's/node-id=1-1/node-id=2-2/g' "$dir/src/ds/Button.figma.ts"
expect "a baseline entry that is now mapped is reported stale" 1 "no longer unmapped" -- \
  bash -c "cd '$dir' && node '$CLI' audit-design-orphans"
rm -rf "$dir"

# --- values written down instead of bound to a token ---

dir="$(work)"
printf 'export const Separator = () => <View style={{ borderColor: "#ff0000" }} />;\n' \
  > "$dir/src/ds/Separator.tsx"
expect "a hardcoded hex colour fails" 1 "src/ds/Separator.tsx:1  #ff0000" -- \
  bash -c "cd '$dir' && node '$CLI' audit-hardcoded-values"
expect "…and trips the post-write guard" 2 "instead of bound to a token" -- \
  bash -c "cd '$dir' && printf '{\"tool_input\":{\"file_path\":\"$dir/src/ds/Separator.tsx\"}}' | node '$CLI' guard --post-write"
allow_literals_in "$dir" "src/ds/Separator.tsx"
expect "…unless that file is where the palette lives" 0 "1 path pattern(s) allowed" -- \
  bash -c "cd '$dir' && node '$CLI' audit-hardcoded-values"
rm -rf "$dir"

dir="$(work)"
printf 'export const Separator = () => <View style={{ backgroundColor: theme.line }} />;\n// was rgba(0, 0, 0, 0.12) before the token existed\n' \
  > "$dir/src/ds/Separator.tsx"
expect "a colour named in a comment is documentation, not a value" 0 "No hardcoded colours" -- \
  bash -c "cd '$dir' && node '$CLI' audit-hardcoded-values"
rm -rf "$dir"

dir="$(work)"
printf 'export const Separator = () => <View style={{ backgroundColor: rgba(0, 0, 0, 0.12) }} />;\n' \
  > "$dir/src/ds/Separator.tsx"
expect "a colour function fails too" 1 "rgba(…)" -- \
  bash -c "cd '$dir' && node '$CLI' audit-hardcoded-values"
rm -rf "$dir"

echo
echo "$pass passed, $fail failed"
[[ "$fail" == 0 ]]
