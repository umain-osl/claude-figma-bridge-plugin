---
description: Re-snapshot the Figma library into the committed component cache
---

Refresh the committed component cache for this repo. Requires Figma MCP access in this session.

1. Read `figma-bridge.json` for `figma.fileKey` and `paths.componentCache` / `componentCacheMeta`.
2. Call `list_file_components_for_code_connect({ fileKey })`.
3. Write the components to `paths.componentCache`, and `{ fileKey, fileName, fetchedAt, componentCount }`
   to `paths.componentCacheMeta`. Keep the existing `$comment` in each file.
4. Run `/figma-bridge:check`.

Then read the diff and report it as a changelog, not as noise — this is the only place the design
side's changes become visible to the repo. Call out in particular:

- components that disappeared, and whether any mapping still points at them;
- components that moved onto or off a retired page — a mapping onto a retired page fails the checks;
- new components that fill a slot the codebase currently works around.
