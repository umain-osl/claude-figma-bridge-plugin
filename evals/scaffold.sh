#!/usr/bin/env bash
# Materialises the repo a case runs against.
#
#   ./evals/scaffold.sh <case-name> <target-dir>
#
# Each case needs a different starting state, and the state *is* half the test:
# `reuse-existing-component` only means something in a repo that already has a
# mapped Button, and `silent-in-an-unconfigured-repo` only means something in one
# with no config at all. Kept as a script rather than described in prose so the
# preconditions cannot drift away from what the graders assume.
set -euo pipefail

case_name="${1:-}"
target="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
fixture="$here/../tests/fixture"

if [[ -z "$case_name" || -z "$target" ]]; then
  echo "Usage: $0 <case-name> <target-dir>" >&2
  exit 1
fi

mkdir -p "$target"

# The onboarded design-system repo: config, mappings, committed component cache.
with_fixture() {
  cp -R "$fixture/." "$target/"
  mkdir -p "$target/src/app"
}

# A design system with no figma-bridge.json — nothing has been onboarded yet.
without_config() {
  cp -R "$fixture/." "$target/"
  rm -f "$target/figma-bridge.json"
  rm -rf "$target/design"
  mkdir -p "$target/src/app"
}

case "$case_name" in
  reuse-existing-component | stop-on-unmatched-slot | orphan-list-consulted | no-hex-crosses)
    with_fixture
    ;;
  onboard-asks-first)
    without_config
    ;;
  silent-in-an-unconfigured-repo)
    # No design system, no config, nothing for the plugin to have an opinion about.
    mkdir -p "$target/src/utils"
    printf 'export const noop = () => undefined;\n' > "$target/src/utils/time.ts"
    ;;
  *)
    echo "Unknown case: $case_name" >&2
    exit 1
    ;;
esac

git -C "$target" init -q 2>/dev/null || true
echo "Scaffolded $case_name in $target"
