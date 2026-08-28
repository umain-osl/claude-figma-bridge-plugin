---
description: Check whether this repo and this machine are wired up for the Figma workflow
---

Run:

```bash
node scripts/figma-bridge/cli.mjs doctor 2>/dev/null || \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/figma-bridge/cli.mjs" doctor
```

Relay the output, then resolve what it flags using the `figma-bridge-setup` skill. Two things the
doctor cannot check, so state them as open questions rather than assuming they are fine:

- whether Figma has the design system's fonts installed — only Figma can answer, and missing fonts
  silently degrade every write into Figma;
- whether this user is signed in to the Figma MCP server, which is per-user OAuth and separate from
  the CLI token.

If there is no `figma-bridge.json`, the repo has not been onboarded: offer `/figma-bridge:onboard`.
