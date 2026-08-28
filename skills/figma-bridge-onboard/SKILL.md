---
name: figma-bridge-onboard
description: |
  Bootstraps a repository into the two-way Figma workflow: detects the design system, writes
  figma-bridge.json, vendors the checks so CI can run them, snapshots the Figma library, and
  writes the repo's own token map and library notes. Use when a repo has no figma-bridge.json
  and someone wants Figma → code or code → Figma to work in it, or when asked to set up, wire
  up, or kickstart Code Connect / the Figma workflow in a new repo.
---

# Onboarding a repo

The workflow this plugin encodes is generic; every fact that makes it work is not. Onboarding is
where the repo-specific facts get written down once, into artifacts the other skills read:

| Artifact | Holds |
| --- | --- |
| `figma-bridge.json` | where the design system is, which Figma file it is linked to, which page is retired |
| `<paths.unmapped>` | components deliberately without a Figma counterpart, each with a reason |
| `<paths.componentCache>` | a committed snapshot of the published Figma components |
| `<paths.tokenMap>` | how this repo's tokens and typography correspond to Figma's variables |
| `<paths.libraryNotes>` | the things about this library a name does not tell you |
| `scripts/figma-bridge/` | the checks, vendored so CI runs them without the plugin |

Do not skip to authoring mappings. A mapping written before the inventory exists is a guess, and
`figma-bridge check` will not be able to tell you it is wrong.

## 0. Establish the facts you cannot detect

Ask for these up front, in one message, and stop if they are not available — every later step
depends on them:

1. **The Figma file** — a URL to the library the repo should link against. The key is the segment
   after `/design/`.
2. **Whether that file is a published library or a scratch copy.** It decides how careful the
   write guard has to be, and whether `importComponentSetByKeyAsync` can work at all.
3. **Who owns the design side.** Every unmappable difference this process finds is a question for
   that person, not something to resolve in code.
4. **Plan and seat.** Code Connect needs a **Dev or Full seat on an Organization or Enterprise
   plan**; without it the CLI fails in a way that reads like a bad token, so establish it before
   promising anyone a Dev Mode snippet. The Variables REST API is limited to Enterprise orgs, which
   is why variables go through the Plugin API instead. The audits themselves need no plan — say so,
   because it decides how much of this a team can adopt today.

## 1. Detect the design system

Propose, then confirm — do not assume:

```bash
# Directories that look like a component library
fd -t d -d 3 'design-system|ui|components|ds' src app packages 2>/dev/null || \
  find src app packages -maxdepth 3 -type d \( -name 'design-system' -o -name ui -o -name components \) 2>/dev/null
```

What you need to settle:

- **`roots`** — the directories a component must live in to be governed. Narrow is better: the
  coverage check demands a Figma counterpart for everything under them.
- **`ignoreDirs`** — subdirectories holding assets or primitives rather than mappable components
  (`icons`, `illustrations`, generated code).
- **`componentExtension` / `mappingSuffix`** — `.tsx` and `.figma.ts` for React and React Native.
  For another Code Connect parser (`swift`, `compose`, `html`), set these and `codeConnect.parser`
  to match; the audits are React-shaped, so say plainly that snippet-import checking does not
  apply.
- **`tokens.allowLiteralsIn`** — the file(s) that define the palette. `audit-hardcoded-values`
  fails on a colour written down anywhere else under the roots, so this list is the only sanctioned
  exception. Find the palette rather than guessing: it is usually the module the components import
  their colours from. Keep it as short as it can be, and note that a pattern matching nothing makes
  the doctor fail, because a stale exception is a hole nobody looks at.
- **`figma.ignorePagePattern`** — the pages nothing in code could ever map to. Read the page names
  out of the cache before deciding: an icon set the repo holds as SVGs, a cover page, a
  documentation page. Skipping this is the difference between a design-side report someone reads and
  one that is mostly icons.
- **`figma.designOnly`** — leave it `report` at onboarding. `audit-design-orphans` will list every
  published component with no code counterpart, which at this stage is most of the library; that
  list is a finding to hand the design owner, not a failure. Switch to `baseline` once the team
  wants coverage frozen, and write the baseline with
  `figma-bridge audit-design-orphans --write-baseline`.
- **`verify`** — the exact commands that gate a change in this repo. Get them from
  `package.json`, and note the traps: a repo where `npm test` is an e2e build needs the unit
  command named explicitly.

## 2. Write the config

Copy `${CLAUDE_PLUGIN_ROOT}/scripts/figma-bridge/templates/figma-bridge.json` to the repo root
and fill it in. A filled-in example, for a React Native repo whose library lives in one
directory:

```json
{
  "designSystem": {
    "name": "Atlas",
    "roots": ["src/atlas"],
    "ignoreDirs": ["icons", "illustrations"]
  },
  "figma": {
    "fileKey": "<22+ character key from the file URL>",
    "fileName": "Atlas — app components",
    "retiredPagePattern": "graveyard"
  },
  "codeConnect": { "parser": "react", "label": "React Native" },
  "paths": {
    "unmapped": "design/figma/unmapped-components.json",
    "componentCache": "design/figma/components.json",
    "componentCacheMeta": "design/figma/components.meta.json",
    "tokenMap": "design/figma/tokens.md",
    "libraryNotes": "design/figma/library-notes.md"
  },
  "verify": ["npm run type-check", "npm run lint", "npm run test:unit"],
  "fonts": {
    "families": ["Atlas Text", "Atlas Display"],
    "source": "src/assets/fonts",
    "substitute": { "family": "Inter", "style": "SemiBold" }
  }
}
```

`retiredPagePattern` matters more than it looks and cannot be detected: leave it empty until you
have seen the page list in step 4, then set it.

## 3. Vendor the checks and wire the scripts

The plugin's hooks run from the plugin, but CI has no plugins. Vendor the checks so the repo owns
them:

```bash
mkdir -p scripts
cp -R "${CLAUDE_PLUGIN_ROOT}/scripts/figma-bridge" scripts/figma-bridge
```

Then add the scripts, adapting to the repo's package manager. The dry-run publish is what parses
every template, so keep it in `figma:check`:

```json
{
  "figma:check": "node scripts/figma-bridge/cli.mjs check && node --env-file-if-exists=.env.local node_modules/@figma/code-connect/bin/figma connect publish --dry-run --exit-on-unreadable-files",
  "figma:publish": "node scripts/figma-bridge/cli.mjs check && node --env-file-if-exists=.env.local node_modules/@figma/code-connect/bin/figma connect publish --exit-on-unreadable-files",
  "figma:retarget": "node scripts/figma-bridge/cli.mjs retarget",
  "figma:doctor": "node scripts/figma-bridge/cli.mjs doctor"
}
```

The Code Connect CLI calls bare `dotenv.config()`, so it reads `.env` only — the
`--env-file-if-exists=.env.local` flag is what bridges a token kept out of git. Keep it on any
script you add.

Add `figma:check` to the PR workflow. Two things to get right there, both of which have cost a
day: install with the flags the repo already uses (if that is `--omit=dev`, the mapping templates
must stay out of the type-check — see the `figma-code-connect` skill), and never let a step that
*writes* to Figma into CI, because there is no service credential for it.

## 4. Snapshot the Figma library

In an interactive session with Figma MCP access:

```js
list_file_components_for_code_connect({ fileKey })
```

Write the result to `<paths.componentCache>` and record where it came from in
`<paths.componentCacheMeta>` (`fileKey`, `fetchedAt`, `componentCount`). The checks read the cache
and never call the API, so they stay hermetic and cost no quota. Treat its git diff as the
design-side changelog.

Now read the page names out of it and settle `retiredPagePattern`:

```bash
jq -r '[.[].pageName] | group_by(.) | map({page: .[0], components: length}) | sort_by(-.components)' \
  design/figma/components.json
```

A page called `Graveyard`, `Deprecated`, `Old` or `Archive` is the one to name. Check its instance
counts before dismissing it as harmless: a retired page holds what used to be everywhere, so it
often carries the highest instance counts in the file — and anything that ranks candidates by
popularity will then pick dead components first.

## 5. Write the token map and the library notes

Copy `templates/tokens.md` and `templates/library-notes.md` into `design/figma/` and fill them in.
These two files are where this repo's specifics live, and the `figma-to-code` and
`design-system-reuse` skills read them instead of carrying any library's details.

For the token map, get the raw material from Figma and the code:

- `get_variable_defs` on a representative frame, or `search_design_system({ includeVariables: true })`.
- The repo's own token source — a Tailwind theme, a `COLORS` object, a token package.

Then write the correspondence by hand, and record the constraints the type system imposes that
the design does not. Those constraints are what stop an agent reaching for a `className` override
later.

For the library notes, seed them from what the cache already tells you — retired pages, names
that mislead, and any term the team uses for more than one component — and say plainly that the
file is expected to grow every time someone gets burned.

## 6. Bootstrap the mappings

Nothing works before there are mappings: with none, an agent handed a Figma node searches the
codebase, fails, and writes a parallel component. Get the highest-traffic components linked
first — buttons, inputs, cards, list rows, the top bar — following the
[figma-code-connect](../figma-code-connect/SKILL.md) recipe. Ask which components matter rather
than working alphabetically.

`get_code_connect_suggestions` will propose pairings; treat them as candidates to verify by
rendering, not as answers. Names mislead, and a plausible-looking wrong mapping is worse than a
missing one — it sends the next agent confidently to the wrong component.

## 7. Declare, verify, hand over

```bash
node scripts/figma-bridge/cli.mjs doctor
node scripts/figma-bridge/cli.mjs check
```

Coverage will now fail on every component with no mapping. That list is the onboarding backlog,
and it is the deliverable of this step — not something to clear by declaring entries in the
unmapped list. Declare only what genuinely has no counterpart, with a reason a person wrote, and
take the rest to the design owner.

Finally, point the repo's agent instructions at the workflow — a line in `CLAUDE.md` /
`AGENTS.md` naming `figma-bridge.json`, the check command, and the rule that a component under
the design system roots needs a Figma counterpart. Confirm the write guard is live by attempting
a Figma write against a different file key and watching it be denied.
