---
name: design-system-reuse
description: |
  The gate that must pass before building or changing any screen, in code or in Figma.
  Establishes what the user actually intends, forces an explicit component mapping against the
  design system that already exists, and blocks inventing new components without permission. Use
  at the start of every figma-to-code and code-to-figma task, and whenever a screen slot has no
  obvious existing component.
---

# Design System Reuse

A screen is assembled from components that already exist in **both** Figma and code, linked by
Code Connect. Your default assumption is that the component you need already exists and you have
not found it yet.

**Inventing a component is the most expensive mistake available.** It produces a parallel
implementation nobody designed, nobody reviewed, and no Figma node governs — and the next agent
building a screen cannot discover it from a design. It is also the easiest mistake to make,
because a plausible component is quick to write and looks like progress.

Read the repo's `figma-bridge.json` first: it names the design system, its roots, and the file it
is linked to. If there is none, the repo has not been onboarded — use
[figma-bridge-onboard](../figma-bridge-onboard/SKILL.md) rather than proceeding on guesses.

## 1. Establish intent before touching anything

Every screen request is one of three things. Decide which, and say so.

| Intent | Signal | What you may do |
| --- | --- | --- |
| **Assemble** | "build a screen that…", "add a view for…", "show X using Y" | Compose existing components. No new components. |
| **Modify** | "change the card so…", "the button should…" | Change an existing component in **both** Figma and code, and update its mapping. |
| **Extend** | "we need a new component for…" | Create a new component — **only** after explicit permission. |

**Assemble is the default.** If the user names a component — by its design name, or by whatever
the team calls it — that is an instruction to reuse a specific existing thing. Find it; do not
approximate it. If you cannot find what they named, ask which one they mean; do not build
something with that name.

## 2. Take inventory before writing

Search all six sources. Do not skip one because another looked empty.

1. **Code Connect mappings** — the mapping files under the design system roots. Each has a
   `// url=` directive naming its Figma node and a `// component=` naming the code component.
   This is the authoritative list of what is already linked.
2. **Code components** — the roots themselves. Read the doc comments; several usually name their
   Figma node.
3. **The committed component cache** (`paths.componentCache`) — node ids, variant options,
   instance counts, page names. Query it with `jq`; never call the Figma API for something the
   cache already holds.
4. **The library notes** (`paths.libraryNotes`) — the repo's written record of names that
   mislead, terms with more than one referent, and which pages are retired. Read this before
   trusting any component name.
5. **The design-only list** — run `figma-bridge audit-design-orphans`. It reports every published
   component that no mapping points at, grouped by page. When a slot has no obvious match, this is
   the list that answers whether the design system already publishes something for it. A component
   in there is a candidate to map, not a licence to build.
6. **Existing Figma screens** — the page holding real screens assembled from the library. If a
   pattern exists on one, prefer it over authoring your own.

### Ignore retired pages, and do not rank by popularity

`figma.retiredPagePattern` in the config names the pages holding work the team no longer follows.
Never map to them, never take a pattern from them, and treat a frame built on their components as
stale rather than as evidence about the current design.

This matters more than it sounds, because **instance count points the wrong way**. A retired page
holds what used to be everywhere, so in a mature library it accumulates the highest instance
counts in the file — often including the chrome components, which every old screen carried.
Ranking candidates by `instanceCount` therefore hands you dead components first. Filter on
`pageName`, then rank.

`figma-bridge check` fails if any mapping's node id resolves to a component on a retired page, so
this cannot drift back in silently.

### Verify names against structure, not against plausibility

Names mislead in every mature library, in ways specific to it. Expect all four of these, and
verify rather than assume:

- **A singular/plural mismatch.** A component called `List` is as likely to be one row as a list.
- **A generic name already taken.** Where two components could both be called `Card`, the one
  holding the name is not necessarily the one you want.
- **A name describing a placement rather than a thing** — a slot on a particular screen, reused
  everywhere since.
- **One team term covering several components.** When a phrase has more than one referent, the
  answer to "which do you mean?" is a question, not a guess.

So: render it, or read its children. A structural guess is not verification. And when you resolve
one of these, write it into `paths.libraryNotes` — that file exists so the next agent does not
repeat the work.

## 3. Produce the mapping table, and show it

Before writing any code or any Figma script, produce this and put it in your reply:

| Screen slot | Figma node | Code component | Link status |
| --- | --- | --- | --- |
| Filter row | `<node name>` `<id>` | `<component>` in a horizontal scroll container | mapped, via the chip inside it |
| Results list | `<node name>` `<id>` | `<component>` | mapped |
| Empty state | — | — | **no match — asking** |

This single step is what catches invention. A slot you cannot fill becomes a visible gap rather
than a silent decision.

**A slot with no match is a finding, not a licence.** Stop, name it, and ask.

## 4. Creating a component, if you are given permission

A component may not exist in code alone. Create all three together, in one change:

1. The **Figma component** — a real component or component set, with its values bound to the
   library's variables (never hardcoded hex or pixel spacing).
2. The **code component** under the design system roots, using the repo's tokens and typography
   per `paths.tokenMap`.
3. The **Code Connect mapping** — see [figma-code-connect](../figma-code-connect/SKILL.md).

Before proposing a new component, state why each near neighbour does not fit. "Nothing matched"
is not an argument; "the existing chip is the same affordance, so a second one would be
duplication" is.

## 5. Enforcement

`figma-bridge audit-coverage` **fails** when a component under the design system roots has neither a
mapping beside it nor an entry in `paths.unmapped` with a written reason. The plugin also runs it as
a `PostToolUse` hook, so an invented component is reported at the moment the file is written rather
than at some later gate.

Two more checks close the same loop from the other side. `audit-design-orphans` reports published
components with no code counterpart — and fails on a new one where the repo has set
`figma.designOnly` to `baseline`. `audit-hardcoded-values` fails on a colour written down instead of
taken from the token map, which is the other way a component escapes the design system's authority
while looking correct.

**Do not add a declaration to silence the check.** A component with no Figma counterpart is a
design decision that belongs to the design owner. Ask.

## Why this gate exists

Invention does not look like a mistake while it is happening. It looks like progress: a component
that renders the right thing, written quickly, in the style of its neighbours. The shape it takes
is consistent enough to name:

- The user asks for a screen "using the X card". No component is found under that exact name, so
  one is written — while the component they meant exists under a different name, already mapped,
  already built for that exact content.
- A small piece of a screen — a filter chip, a badge, a row — gets written inline because it looks
  too small to search for. It was a published component, already in use on other screens, already
  taking the prop that was about to be reinvented.

In both shapes the component existed, was already linked, and a few minutes of inventory would
have found it. And in both, the invention was never announced before it was built — which is the
part that makes it expensive, because it is discovered in review rather than decided up front.
