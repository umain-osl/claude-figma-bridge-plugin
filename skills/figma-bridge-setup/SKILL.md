---
name: figma-bridge-setup
description: |
  Prepares a machine to run the Figma workflows in a repo already onboarded to Figma Bridge: the
  two separate credentials and their scopes, the write guardrail, installing the design system's
  fonts into Figma, and refreshing the committed component cache. Use when setting up a new
  device, when a Figma command fails for environmental reasons, or before handing the workflow to
  a designer.
---

# Machine setup

Run through this once per machine. Every step has burned time somewhere when skipped. Start with:

```bash
node scripts/figma-bridge/cli.mjs doctor
```

It reports the config, the component cache, credentials and toolchain, and it is faster than
guessing which of them is at fault.

## 1. Node and the package manager

Use the version the repo pins (`.nvmrc`, `engines`, `devEngines`). A shell on the wrong major
usually means **no** npm script runs at all — not the linter, not the type-check, not the Figma
checks — and the error names a version rather than the real problem.

```bash
nvm use
node -v && npm -v
```

Check that `engines`, `devEngines` and the CI pin actually agree with each other. A range that no
released version satisfies is easy to write and fails everywhere at once, CI included, with an
error naming a version rather than the contradiction.

## 2. Access: two separate credentials

**These are different things, and both are needed.** Getting this wrong looks like a token problem
when it is not.

| Credential | Covers | Needed for |
| --- | --- | --- |
| **Personal access token** in `.env.local` | the Code Connect **CLI** | `figma:check`, `figma:publish` |
| **Figma MCP OAuth**, per user | reads and `use_figma` | anything design → code or code → Figma |

The token needs exactly two scopes, no more:

- `file_content:read`
- `file_code_connect:write`

Put it in `.env.local` as `FIGMA_ACCESS_TOKEN`. The CLI calls bare `dotenv.config()` and so reads
`.env` only — the npm scripts bridge it with `node --env-file-if-exists=.env.local`. Keep that flag
if you add scripts. Tokens expire; when the checks start failing with an auth error, that is
usually why rather than the mappings.

The MCP side is **per-user OAuth**, so you must be signed in to the Figma MCP server separately.
That is also why **any step that writes to Figma runs in an interactive session and never in
CI** — there is no service credential for it.

Two plan-level facts worth knowing before debugging something that is not broken:

- **Code Connect requires an Organization plan and a Full seat.** Without it the CLI fails in a way
  that reads like a bad token.
- **The Variables REST API is Enterprise-only** — on a lower plan the scope does not exist. This is
  why variables are read and written through the **Plugin API** (`figma.variables`) via `use_figma`
  instead, which has no such restriction.

MCP reads are quota-limited per plan (200/day at 15/min on Organization). The Code Connect CLI goes
through the REST API with the token and does not touch that quota — only design *reads* do.

## 3. One Figma file key, in one place

`figma-bridge.json` holds **one** key — the file the repo points at. Three surfaces must agree with
it, and all three are checked:

1. `figma-bridge.json` — the source of truth.
2. The `// url=` directive in every Code Connect mapping — the CLI reads it.
3. The doc-comment links in the component sources — a developer clicks them.

```bash
node scripts/figma-bridge/cli.mjs retarget --check              # verify all three agree
node scripts/figma-bridge/cli.mjs retarget <fileKey> ["Name"]   # point everything at another file
```

`retarget --check` runs as the first step of `check`, so a stray reference fails the gate. It also
fails when the component cache records a different file from the target, because the cache is what
the coverage check reads to decide which components are retired — a cache from another library
reasons about the wrong components.

Never rewrite a key by hand. A partial find-and-replace publishes a mixture, and it tends to leave
the doc-comment links behind pointing at a different library from the mappings, which is exactly
what `--check` was added to catch.

Node ids are **not** guaranteed to survive a file copy. They sometimes do — a duplicate made from
a library can keep them, which makes retargeting look like nothing but a key swap — but that is
not a property you can rely on. After retargeting, refresh the component cache and run the checks.

## 4. The guardrails

Installing this plugin installs the hooks; there is nothing to configure per repo. They no-op in
any repo without a `figma-bridge.json`.

| Hook | Fires | Does |
| --- | --- | --- |
| Figma target guard | `PreToolUse` on the Figma write tools | Denies any write whose `fileKey` is not the one in `figma-bridge.json` |
| Design-system guard | `PostToolUse` on `Write`/`Edit` under the design system roots | Runs the coverage audit and reports immediately if a component was invented |
| Snippet guard | `PostToolUse` on `Write`/`Edit` of a mapping | Runs the snippet-import audit |

The target guard **fails closed in every direction**: a call with no `fileKey` is denied, and so is
one made when the config cannot be read — otherwise an unreadable config would compare `"" === ""`
and let anything through. Reading the key from the config means `retarget` moves the guardrail with
it.

The `PostToolUse` guards print nothing on success and feed the audit's message straight back on
failure — the report arrives at the moment of the write, not at some later gate.

Grant `mcp__figma__use_figma` in `.claude/settings.local.json` (gitignored) rather than in the
committed settings, so one person's grant does not bind their teammates:

```json
{ "permissions": { "allow": ["mcp__figma__use_figma"] } }
```

An instruction is a request; a hook is enforcement. If a hook seems not to fire, open `/hooks` once
to reload the config.

## 5. Install the design system's fonts into Figma

**This is the step most likely to be missing, and it silently degrades everything.**

If Figma cannot see the families named in `fonts.families`:

- `figma.listAvailableFontsAsync()` returns no such family.
- `loadFontAsync({ family: '<Family>' })` fails with *"The font family … does not exist"*.
- `setProperties()` on any text property refuses: *"the component uses a font that isn't
  available"*.

The font files are usually in the repo already — `fonts.source` in the config names the directory.
Install them locally and run the Figma desktop app so Figma picks them up. Verify:

```js
const fonts = await figma.listAvailableFontsAsync();
return fonts.filter((f) => f.fontName.family.startsWith('<Prefix>')).map((f) => f.fontName.style);
```

**Without the fonts you are not blocked**, but you must use the substitution technique in
[code-to-figma](../code-to-figma/references/plugin-api.md#writing-text-without-the-product-font) —
author in the family named in `fonts.substitute` and apply the local text style afterwards. With the
fonts installed, that dance is unnecessary. Either way, assert the rendered font family rather than
assuming a successful script produced the right typeface.

## 6. Refresh the component cache when the library changes

`paths.componentCache` is a committed snapshot of the published components — node ids, variant
options, defaults, instance counts, dependency graph. The checks read it and never call the API, so
they are hermetic and cost no quota.

Refresh deliberately, in an interactive session, via `list_file_components_for_code_connect`, and
treat the git diff as the design-side changelog. `paths.componentCacheMeta` records which file and
date it came from, and `retarget --check` fails if that drifts from the target.

## 7. Verify the whole chain

```bash
node scripts/figma-bridge/cli.mjs doctor
npm run figma:check
```

…then the commands in `verify` in `figma-bridge.json`. Note which one is the unit suite: in more
than one repo `npm test` is the end-to-end build, and running it to check a component change costs
ten minutes and answers nothing.
