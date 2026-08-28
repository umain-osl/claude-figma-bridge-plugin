---
name: code-to-figma
description: |
  Generates a Figma frame from a screen that exists in the codebase, using real instances of the
  design system library rather than drawn rectangles. Covers resolving components when
  import-by-key fails, writing text when the product font is not installed in Figma, mandatory
  variable binding, and the Plugin API traps that cost the most. Use when asked to push, sync or
  reproduce a code screen in Figma.
---

# Code → Figma

The output must be a frame built from real instances of the library's components, with every value
bound to a variable — not a drawing that resembles the screen. A drawn approximation is worse than
nothing: it cannot be edited as a design, and it will be mistaken for one.

The test of a push is the comparison afterwards, when a designer frame for the same screen already
exists. Expect differences, and read each one before calling it drift — **the generated frame is
sometimes the correct one.** A common case: the existing frame uses a component that has since
been retired, while the code uses its replacement. Check which page each component lives on before
concluding anything.

## Prerequisites

1. [figma-bridge-setup](../figma-bridge-setup/SKILL.md) — especially **installing the product
   fonts**, which removes the need for the substitution dance below.
2. [design-system-reuse](../design-system-reuse/SKILL.md) — produce the mapping table first.
3. Load Figma's own guidance: `/figma-use` (**mandatory** before every `use_figma` call) and
   `/figma-generate-design`, or the `skill://figma/figma-use/SKILL.md` and
   `skill://figma/figma-generate-design/SKILL.md` MCP resources. Pass both in `skillNames`.

Do **not** use `generate_figma_design` for a native app. It drives a browser and reads a live DOM,
which React Native and other non-web targets cannot provide.

## 1. Derive the structure from the code, not from an existing frame

Read the screen and write down the tree: containers, spacing, tokens, and which library component
fills each slot. Work only from the code.

Take components only from the current library pages — never instance from a retired page or copy
its structure.

If a Figma frame for this screen already exists, **do not look at it until you have generated
yours.** Comparing afterwards is a real test; peeking first turns the exercise into a clone.
Cloning an existing frame and calling it a code→Figma push proves nothing, because the pixels were
already the design's.

## 2. Resolve components — in this order

**Import by key usually fails.** `importComponentSetByKeyAsync` returns
`Component set with key "…" not found` for every component in a file that is not a published
library — and duplicating a Figma file does not carry publication over. `assetKey` values in the
committed component cache are not usable for import against a scratch copy.

1. **The Code Connect mappings** give you the node id from `// url=`. Then `getNodeByIdAsync(nodeId)`
   and `createInstance()` from a variant. This works because the components are local to the file.
2. **Walk an existing screen's instances** when a node id is unknown. Authoritative, and needs no
   keys:

```js
const frame = await figma.getNodeByIdAsync('<a screen on the current screens page>');
const sets = new Map();
for (const inst of frame.findAllWithCriteria({ types: ['INSTANCE'] })) {
  const mc = inst.mainComponent;
  if (!mc) continue;
  const owner = mc.parent?.type === 'COMPONENT_SET' ? mc.parent : mc;
  if (!sets.has(owner.id)) sets.set(owner.id, { name: owner.name, id: owner.id, remote: owner.remote });
}
return [...sets.values()];
```

3. `search_design_system` only as a last resort.

Pick variants by name — `c.name.includes('Button type=Primary') && c.name.includes('State=Default')`
— and read the **code's default prop values**, not just what the JSX passes. A `<Button>` with no
`variant` is whatever its default is; a top bar with no back-button prop still renders one.

## 3. Bind variables — never hardcode

Every colour, spacing value and radius you set must come from the library's variable collection.
Hardcoding them is the difference between a tokenised frame and a pile of magic numbers, and it is
easy to do accidentally and never notice. The recipe, including the fallback-colour trap, is in
[references/plugin-api.md](references/plugin-api.md#binding-variables).

`getLocalVariableCollectionsAsync()` returns only *local* variables. An empty result does not mean
none exist — check `search_design_system` with `includeVariables: true` before concluding.

## 4. Text, assets, and the traps

Three things account for nearly every wasted hour here, and each has a worked recipe in
[references/plugin-api.md](references/plugin-api.md):

- **Writing text when Figma lacks the product font.** `setProperties()` cannot be made to work; the
  text node must be written directly, and text styles applied in a final pass after every layout
  write.
- **Importing icons and photographs.** SVGs come from the repo's own source; photographs cannot be
  fetched at all, because the Plugin API has no network access.
- **Nine Plugin API traps** with a real failure behind each, from child-index ordering to cloned
  nodes keeping absolute positioning.

Read that file before writing the first script, not after the first error.

## 5. Work incrementally, then verify

At most ~10 logical operations per `use_figma` call. Create the wrapper first and return its id;
build one section per call; `await node.screenshot({ scale: 1 })` after each. Always return created
and mutated node ids.

Then audit — do not rely on the screenshot alone. Assert, in a script:

- every container you authored binds variables, and no node you authored carries an unbound solid
  fill;
- the **rendered** font family on every product text node is the product font — a successful script
  can still produce the wrong typeface;
- no leftover component defaults remain (`Button text`, `Badge`, `Item`, `Label`, `Heading`).

Finally, if a designer frame exists for this screen, screenshot both and report the differences.
Differences are findings about design/code drift, not errors to paper over.
