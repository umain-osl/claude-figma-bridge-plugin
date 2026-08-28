# The defects `figma connect migrate` introduces

Three of them, every time. Each was found in a published snippet, not in review.

## 1. Missing imports

`migrate` omits imports for identifiers that appear only in *values* — an enum member passed to
`figma.enum`, an icon injected via `jsxElement`, a variant enum in a prop. A mapping with several
of these loses several imports at once, so the count of missing imports is not a signal that you
have found them all.

Diff the `imports` array against the rendered snippet, every time. `audit-snippets` exists because
this defect is systematic; it is not a substitute for reading the snippet, but it is what makes the
failure impossible to ship.

Where an import is only correct when a slot actually renders, compute it — a template is a
function:

```ts
const imports = ["import { ListRow } from '@/design-system/ListRow';"];
if (icon) {
  imports.push("import ChevronRight from '@/design-system/icons/chevronRight.svg';");
  imports.push("import { COLORS } from '@/design-system/colors';");
}
```

## 2. Computed props interpolated unevaluated

A ternary in the draft is emitted verbatim, so the snippet reads

```jsx
topBadge={true ? {…} : undefined}
backButtonVariant={!true ? "hidden" : false ? "text" : "chevron"}
```

Resolve the value in the template body and pass the result to `renderProp`.

## 3. The generated `else` branch duplicates the last matched variant

Rather than a safe default. Given a `State` variant of Default/Active/Error, the generated fallback
renders the *error* case — so every instance in a state the mapping does not enumerate produces a
snippet showing the wrong one. Collapse the mapping to what is actually true, and make the fallback
the neutral state.

## The related failure the audits cannot see

Empty JSX expressions — a snippet shipping `icon={}`, which is invalid JSX. `migrate` reads a
nested icon's *name* and emits an instance-swap binding for it, but where the Figma property behind
it is a boolean rather than a swap, the binding resolves to nothing and leaves the braces empty.

When a prop's Figma source is a boolean rather than an instance-swap, there is nothing to bind.
Drop the binding, and record why in the template's header comment so the next person does not
"fix" it back.
