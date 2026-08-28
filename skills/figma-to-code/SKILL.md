---
name: figma-to-code
description: |
  Builds or modifies a screen from a Figma node using the real components the Code Connect links
  point at, rather than reconstructing markup from the design. Covers resolving links before
  reading the design, mapping Figma variables and text styles onto the repo's own tokens, and the
  verification gate. Use when given a Figma URL or node id and asked to implement, port or update
  a screen.
---

# Figma → Code

Read [design-system-reuse](../design-system-reuse/SKILL.md) first and produce its mapping table.
Everything below assumes that gate has passed.

## 1. Check whether the screen already exists

Before implementing, search for it. A Figma frame frequently describes something already built,
and the frame name may describe *behaviour* rather than a new screen.

Watch for a frame name that encodes a *state* — "3 items or more", "logged out", "no results".
That usually means the design documents one branch of behaviour a screen already implements, not
a screen to build. Implementing it produces a static reconstruction that replaces working code
and drops the other branches.

If it exists, say so and offer a change list instead of a rewrite.

Also check which components the frame is built from. **A frame using components from a retired
page is retired work**, not a specification — do not implement against it. Confirm with the
design owner which frame is current before building from an old one.

## 2. Resolve the links before reading the design

```js
get_code_connect_map({ fileKey, nodeId })
```

Call this on the **frame**, not just on components: it returns the rendered snippet for every
mapped instance inside it, which tells you exactly which real component to reach for.

Note that `get_design_context` may **refuse** and return a "components are missing Code Connect
mappings" script instead of design context. That is not a failure to work around — it means
unmapped components are in the frame. Relay the prompt to the user verbatim; closing those gaps is
often what unblocks the read. On one screen, mapping two components is what made
`get_design_context` return anything at all.

## 3. Then read design context

Load Figma's own design-to-code guidance (prefer the `/figma-design-to-code` skill; otherwise the
`skill://figma/figma-design-to-code/SKILL.md` MCP resource) — `get_design_context` requires it —
and pass `skillNames` accordingly.

The returned markup is a **reference**, never code to paste. Two things in the response matter
more than the markup:

- **Code Connect snippets**, wrapped in `<CodeConnectSnippet>`. Highest-priority hint: use that
  component. Strip the wrapper.
- **Design annotations** (`data-annotations`). These are designer instructions and must be
  honoured, including the ones that name an accessibility criterion. An annotation of that kind
  usually has more than one valid answer, and the right one depends on something the design
  cannot show — content that varies at runtime, for instance. Say which you chose and why.

A very tall frame returns sparse metadata and screenshots uselessly: a screenshot is fitted to a
fixed box, so a frame many times taller than it is wide comes back a few hundred pixels across and
illegible. Request child regions instead, in one parallel batch.

## 4. Map tokens onto the repo's own system

Read `paths.tokenMap` from `figma-bridge.json` and use it. It is the repo's own translation table
from Figma variable and text-style names to code, and it exists so that **no hex value and no raw
pixel value ever crosses from Figma into the codebase**.

If the map has no row for something the design uses, that is a finding: add the row (having decided
the correspondence deliberately) rather than inlining a literal at the call site. This is enforced,
not advised — `audit-hardcoded-values` fails on a colour written down inside the design system
roots, and the `PostToolUse` hook reports it at the moment of the write.

Two rules that survive every repo:

- **Text styles map onto typography components, not onto font sizes.** A design change then lands
  in one place.
- **A colour or weight the type system does not offer is a design-system change to raise, not a
  `className` override to sneak past.** Constraints of that kind belong in `paths.tokenMap` where
  the next agent will read them.

## 5. Follow the established composition patterns

Reuse the patterns, not just the components. Find them by reading two or three screens that
already do something similar, and note in particular:

- The **list and card wrappers** the repo already has, and the mappers that feed them — building a
  list by hand when a `VerticalCardList` exists is the same mistake as inventing a component, one
  level up.
- The **screen skeleton**: how a route file, a view component, screen tracking and translation are
  wired. Copy it exactly; these are the things a reviewer notices missing.
- **Prop unions that must be satisfied together.** A component's type often admits two props
  only as a pair — an interaction handler and its analytics payload, for instance. Read the type,
  not a nearby usage.
- **Dispatchers.** Where a repo renders CMS or config-driven blocks through one component, add to
  the dispatcher; never reimplement a block.

## 6. Verify

Run the commands `verify` names in `figma-bridge.json`, plus `figma-bridge check` if you touched
components or mappings.

Measure the lint baseline rather than trusting a number written down — it drifts. Stash your
changes, run the linter, restore, and compare.

State plainly whether the screen has been **run**. Static checks passing is not the same as seeing
it render, and a build failure from a missing simulator or SDK is a toolchain problem, not
evidence about your change.
