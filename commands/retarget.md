---
description: Point this repo at a different Figma file, or verify it points at exactly one
argument-hint: "[--check | <fileKey> [file name]]"
---

```bash
node scripts/figma-bridge/cli.mjs retarget $ARGUMENTS 2>/dev/null || \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/figma-bridge/cli.mjs" retarget $ARGUMENTS
```

With no arguments this verifies that the config, every mapping's `// url=` directive, every
component doc-link and the component cache all name the same file.

After an actual retarget:

1. Review the diff before anything else — this rewrites every mapping and every doc link.
2. Refresh the component cache against the new file. Node ids are **not** guaranteed to survive a
   file copy, so do not assume a key swap was sufficient.
3. Run `/figma-bridge:check`.
4. Say plainly that the write guard now permits writes to the new file. If it is a published library
   rather than a scratch copy, a wrong write there is expensive to undo.
