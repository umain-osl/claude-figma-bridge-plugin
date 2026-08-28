# Figma Plugin API recipes and traps

Everything here was learned by hitting it. The Plugin API is reached through `use_figma`, and it
behaves differently from what its type signatures suggest in exactly these places.

## Binding variables

```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const modeId = collections[0].modes[0].modeId;
const V = {};
for (const c of collections)
  for (const id of c.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) V[v.name] = v;
  }

// Seed the fallback with the variable's real value: the literal is what renders in a screenshot
// taken in the same script run, so a black fallback looks like a broken fill.
const paintOf = (name) => {
  const v = V[name];
  const raw = v.valuesByMode[modeId];
  const base = raw && typeof raw === 'object' && 'r' in raw ? raw : { r: 1, g: 1, b: 1 };
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: base }, 'color', v);
};

frame.fills = [paintOf('Color/Base/White')];
frame.setBoundVariable('itemSpacing', V['Numbers/Distance/Distance 16']);
frame.setBoundVariable('topLeftRadius', V['Numbers/Corner radius/Radius 8']);
```

## Writing text without the product font

If Figma has the product fonts, set text normally. If it does not, text is still fully
achievable — this technique is the difference between a real artifact and one full of
"Button text".

`setProperties()` **cannot** be made to work: it refuses with *"Unable to update this text property
because the component uses a font that isn't available"*. Write the text node directly instead:

```js
const SUB = { family: 'Inter', style: 'SemiBold' };  // fonts.substitute from the config
await figma.loadFontAsync(SUB);

const t = instance.findAllWithCriteria({ types: ['TEXT'] })[0];
t.fontName = SUB;              // allowed even though the current font is missing
t.characters = 'Continue';     // now writable
// …all layout writes happen here…
const style = (await figma.getLocalTextStylesAsync()).find((s) => s.name === '<text style name>');
await t.setTextStyleIdAsync(style.id);   // restores real product typography
```

The result is a genuine instance with correct copy **and** the correct text style. Pick the
substitute from what Figma itself offers as the nearest match to the product font, and record it in
`fonts.substitute` in `figma-bridge.json` so every session uses the same one.

Two rules follow:

- **Apply text styles in a final pass, after every layout write.** Applying a style puts the node
  back on the uninstalled font, so any later `textAutoResize`, `resize` or
  `layoutSizingHorizontal` on that node throws
  `Cannot write to node with unloaded font "<Family> Regular"`.
- **`importStyleByKeyAsync` fails** on an unpublished file for the same reason components fail to
  import. Use `getLocalTextStylesAsync()` and match by name.

## Assets

Icons and illustrations import from the repo's own SVG source:

```js
const icon = figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" …>…</svg>');
icon.resize(24, 24);   // the frame scales its contents, so this fits the whole glyph
```

A repo SVG imports as a FRAME of editable VECTOR children at the target size. Include `width` and
`height` as well as `viewBox`, or it falls back to the viewBox size. Codebase SVGs usually use
`currentColor`, which imports as **black** — substitute the real colour into the string, or bind
the vector's fills to a colour variable.

The `use_figma` `code` parameter caps at 50 000 characters, so a large illustration barely fits
alongside the script that places it — check the file size before planning the call, and place one
per call if needed. Never redraw an icon from rotated primitives to get under the limit.

Photographs cannot be fetched — the Plugin API has no network access. Reuse an `imageHash` from a
node already in the file:

```js
node.fills = [{ type: 'IMAGE', imageHash: '<hash from an existing node>', scaleMode: 'FILL' }];
```

Harvest hashes only from nodes with a **single** image fill and a real photo size; nodes stacking
two image fills are masks and render as a transparency checkerboard.

## Traps

- **Later child index renders on top.** `insertChild(0, …)` puts a node at the *bottom*. Two
  successive inserts at 0 reverse their order — that is how a grey placeholder ended up painting
  over a hero photo.
- **Cloned nodes keep absolute positioning.** `layoutSizingHorizontal = 'FILL'` on one throws
  `FILL cannot be set on absolute positioned auto-layout children`. Set
  `layoutPositioning = 'AUTO'` first.
- **`HUG`/`FILL` need the parent to be auto-layout and the child appended already.** Append, then
  size. `layoutSizing*` takes `FIXED|HUG|FILL`; `*AxisSizingMode` takes `FIXED|AUTO` — crossing
  them throws.
- **Page context resets every call.** `await figma.setCurrentPageAsync(page)` at the top of each
  script, at most once per script.
- **Failed scripts are atomic.** Nothing is created. Read the error, fix, retry — do not inspect
  for wreckage.
- **A wrapping text node needs `textAutoResize = 'HEIGHT'` plus an explicit width.** `FILL` alone
  collapses it to near-zero width.
- **Verify what a node actually is before cloning it.** Auto-generated names (`Frame 7842`) say
  nothing, and a node that looks like one component in a screenshot is regularly another — cloning
  by appearance is how a navigation bar ends up at the top of a screen.
- **`getLocalVariableCollectionsAsync()` returns only local variables.** An empty result is not
  proof there are none.
- **A successful script can still produce the wrong typeface.** Assert the rendered font family
  rather than trusting the absence of an error.
