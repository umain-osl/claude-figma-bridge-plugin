---
name: figma-code-connect
description: |
  Authors, migrates, audits and publishes the Code Connect mappings that link a Figma library to
  its code counterparts. Covers the parser-form-first recipe, the defects `figma connect migrate`
  reliably introduces, the rules the parser and template forms impose, and how to verify a
  published snippet. Use when adding or changing a mapping, or when a Dev Mode snippet looks
  wrong.
---

# Code Connect Mappings

The mappings are the substrate both directions read. Without one, an agent handed a Figma node
searches the codebase, fails to find a match, and writes a parallel component — the failure
[design-system-reuse](../design-system-reuse/SKILL.md) exists to prevent.

Run [figma-bridge-setup](../figma-bridge-setup/SKILL.md) first. Mappings live beside their
component, named by `designSystem.mappingSuffix` in `figma-bridge.json`, in **template form** —
CLI v2 refuses to publish parser files.

## Authoring recipe

Never hand-write a template. That cost three failed attempts before this recipe was settled.

### 1. Write the mapping in parser form first

Author the draft with `designSystem.draftSuffix` (`.figma.tsx`). Parser form **typechecks against
the real component**, so a wrong prop name or enum value fails at compile time rather than
shipping a broken snippet.

```tsx
import figma from '@figma/code-connect';
import { Chip } from '@/design-system/Chip';

figma.connect(Chip, 'https://www.figma.com/design/<key>/<file>?node-id=<id>', {
  props: { label: figma.string('Label') },
  example: (props) => <Chip>{props.label}</Chip>,
});
```

Where a required prop has no Figma source, supply a literal so the draft compiles — you will
replace it with an identifier in step 3.

Then run the repo's type-check. A clean typecheck is the point of this step.

### 2. Migrate to template form

`migrate` needs a parser-mode config. Use a throwaway one rather than editing the real
`figma.config.json`:

```bash
cat > figma.config.migrate.json <<'JSON'
{
  "codeConnect": {
    "parser": "react",
    "include": ["src/<design-system>/**/*.figma.tsx", "src/<design-system>/**/*.tsx"],
    "exclude": ["**/node_modules/**"],
    "label": "<the label from figma-bridge.json>",
    "paths": { "@/*": "src/*" }
  }
}
JSON

node --env-file-if-exists=.env.local node_modules/@figma/code-connect/bin/figma connect migrate \
  -c figma.config.migrate.json -f src/<design-system>/<Name>.figma.tsx --outDir /tmp/migrated

rm figma.config.migrate.json
```

`Import for <X> could not be resolved` warnings are expected, and are the cause of the first
defect below.

### 3. Fix the defects `migrate` introduces

Adopt the generated template, then fix all of them. They recur every time — the full list, with
the real cases behind each, is in [references/migrate-defects.md](references/migrate-defects.md):

1. **Missing imports** for identifiers that appear only in *values*.
2. **Computed props interpolated unevaluated**, so the snippet ships a ternary.
3. **An `else` branch that duplicates the last matched variant** rather than a safe default.

### 4. Prefer identifiers over filler values

Where the design has no source for a required prop, render an **identifier**, not a literal.
`logoUrl={item.logoUrl}` reads as "you supply this"; `logoUrl="https://example.com/logo.png"`
invites someone to paste a fake URL and ship it.

### 5. Check, publish, verify

```bash
node scripts/figma-bridge/cli.mjs check   # target, coverage, snippet imports
npm run figma:check                       # …and a dry-run publish, which parses every template
npm run figma:publish
```

Then read the rendered snippet back — do not trust the publish output:

```js
get_code_connect_map({ fileKey, nodeId })   // returns the rendered snippet per node
```

Confirm the props resolve, the imports cover every identifier, and the JSX is valid.

## Rules the parser and template forms impose

- **`figma.enum`'s second argument must be an object literal at the call site.** The parser reads
  it statically; a hoisted `const` fails with
  `figma.enum second argument should be an object literal`. Repetition between two similar
  mappings is required, not sloppiness.
- **Every mapping needs a unique `id`.** A workable convention is `<Component><FigmaNodeName>`,
  which stays readable when one component backs several nodes.
- **Several Figma nodes may map to one code component.** One button component legitimately backs
  both a large and a small Figma button. This is normal, and far preferable to inventing a second
  component to make the mapping one-to-one.
- **`metadata: { nestable: true }`** on components that appear inside others.
- **A template's imports must be absolute.** A snippet is pasted somewhere else, so a relative
  import cannot resolve. `audit-snippets` fails on one.

## Type-checking and CI

Template form defeats type-checking by design: every component reference in it is a *string*
(`figma.helpers.react.identifier('SomeEnum.Member')`, the `imports` array), so the compiler never
checked it anyway. That has one practical consequence worth getting right once.

If CI installs without dev dependencies — a deliberate choice in more than one repo, since it is
what keeps a devDependency out of the bundle — every template fails the type-check with
`Cannot find module 'figma'`. **Exclude the template glob from `tsconfig.json`** rather than
installing dev dependencies in the PR workflow. Nothing is lost: the draft form from step 1
imports the real components and is *not* excluded, `audit-snippets` checks the identifiers, and the
dry-run publish parses every template.

Where the virtual `figma` module's types are needed locally, provide them with a triple-slash
reference in a `.d.ts` rather than a `types` array in `tsconfig.json` — in a repo extending a
framework base config, setting `types` replaces the implicit all-`@types` behaviour and breaks the
framework's own typings.

## The two automated checks

`figma-bridge check` runs both before it will publish, and the plugin also runs each as a
`PostToolUse` hook so a fault surfaces at the moment of the write.

**`audit-snippets`** — every identifier a snippet renders must be imported, and imports must not be
relative. This is the check that earns its keep: the fault it finds is systematic, invisible to
review, and nothing else catches it. The template is valid JavaScript, and `publish` accepts it.

**`audit-coverage`** — two guarantees. Every component under the design system roots must be mapped
or declared in `paths.unmapped` with a reason (the anti-invention guard), and **no mapping may
target a component on a retired page**. Both directions are tested in the plugin's own fixture
suite.

Neither catches **empty JSX expressions** — a snippet can ship `icon={}`, which is invalid JSX.
This happens when `migrate` reads a nested icon's *name* and emits an instance-swap binding for it,
but the Figma property behind it is a boolean rather than a swap, so the binding resolves to
nothing. When a prop's Figma source is a boolean, there is nothing to bind: drop the binding and
record why in the template.

## Declaring what cannot be mapped

Classify every difference and write the reason into the template's header comment:

| Class | Meaning |
| --- | --- |
| `mapped` | Figma property → code prop |
| `wont-map` | Structurally impossible — e.g. a `State=On press` variant, because the code's pressable owns pressed state |
| `design-gap` | Figma has it, code does not |
| `code-gap` | Code has it, Figma does not |

An unmappable difference is the finding. Record it; never edit the component to make a mapping fit.
