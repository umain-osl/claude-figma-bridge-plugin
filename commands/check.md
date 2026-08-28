---
description: Run the Figma Bridge gate — target consistency, component coverage, snippet imports
---

Run the Figma Bridge checks for this repo and report the result.

Prefer the repo's own vendored copy so the result matches what CI runs; fall back to the plugin's:

```bash
node scripts/figma-bridge/cli.mjs check 2>/dev/null || \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/figma-bridge/cli.mjs" check
```

If `@figma/code-connect` is installed, follow it with a dry-run publish — that is what parses every
template:

```bash
node --env-file-if-exists=.env.local node_modules/@figma/code-connect/bin/figma connect publish --dry-run --exit-on-unreadable-files
```

Report failures verbatim, then say what each one means. Do not fix anything yet — a coverage failure
is often a design decision that belongs to the design owner, not a code change.
