# figma-bridge

A Claude Code plugin for running a two-way Figma ↔ code workflow in any repo: implementing a screen
from a Figma node using the components the Code Connect links point at, and pushing a code screen
back into Figma as real library instances.

The plugin holds knowledge that transfers between design systems. Every fact about a particular
library lives in artifacts the skills read from the host repo, written once during onboarding — so
no component name, node id, font family or utility class appears anywhere in here as a fact.

| In the plugin | In the host repo |
| --- | --- |
| the reuse gate and the mapping table it demands | `figma-bridge.json` — roots, file key, retired page |
| the Code Connect authoring recipe and `migrate`'s defects | `paths.tokenMap` — this library's variables → this repo's tokens |
| the Plugin API traps and the missing-font technique | `paths.libraryNotes` — names that mislead, terms with several referents |
| the checks, the guards, the doctor | `paths.componentCache` — the committed component snapshot |

## Install

From this repo directly:

```
/plugin marketplace add umain-osl/claude-figma-bridge-plugin
/plugin install figma-bridge@figma-bridge
```

Or, if you already have the Eidra marketplace added, install it from there — the entry points back
at this repo, so both routes deliver the same thing:

```
/plugin install figma-bridge@eidra-marketplace
```

## Use it in a repo

```
/figma-bridge:onboard <figma file url>
```

Onboarding detects the design system, writes `figma-bridge.json`, vendors the checks into
`scripts/figma-bridge/` so CI can run them without the plugin, snapshots the Figma library, and
writes the repo's own token map and library notes. Then:

```
/figma-bridge:doctor      # is this repo and machine wired up?
/figma-bridge:check       # target consistency, component coverage, snippet imports
```

## Skills

| Skill | Use |
| --- | --- |
| `figma-bridge-onboard` | bootstrap a repo into the workflow — config, vendored checks, library snapshot, token map |
| `figma-bridge-setup` | per-machine setup: the two credentials, the guardrails, the fonts, the cache |
| `design-system-reuse` | the gate before any screen work: intent, inventory, mapping table |
| `figma-to-code` | implement a screen from a Figma node using the linked components |
| `code-to-figma` | push a code screen into Figma as real library instances |
| `figma-code-connect` | author, migrate, audit and publish mappings |

## Commands

| Command | Does |
| --- | --- |
| `/figma-bridge:onboard` | run the onboarding flow |
| `/figma-bridge:doctor` | is this repo and machine wired up? |
| `/figma-bridge:check` | target consistency, component coverage, snippet imports |
| `/figma-bridge:retarget` | point the repo at another Figma file, or verify it points at one |
| `/figma-bridge:refresh-cache` | re-snapshot the library and read the diff as a changelog |

## Hooks

All three no-op in any repo without a `figma-bridge.json`, so the plugin is safe to install
globally.

| Hook | Fires | Does |
| --- | --- | --- |
| target guard | `PreToolUse` on the Figma write tools | denies a write to any file but the configured target; fails closed |
| coverage guard | `PostToolUse` on `Write`/`Edit` under the design system roots | reports an invented component at the moment of the write |
| snippet guard | `PostToolUse` on `Write`/`Edit` of a mapping | reports a snippet that renders an identifier it does not import |

## Checks

`scripts/figma-bridge/` is a zero-dependency Node CLI (Node 20+). Plugin installs run no package
manager, and a script in a plugin directory cannot resolve the host repo's `node_modules`, so the
checks depend on nothing but Node itself. `/figma-bridge:onboard` copies them into the host repo so
CI can run them without the plugin installed — and so a repo that installs with `--omit=dev` can
still run them.

```
figma-bridge check              retarget --check, then both audits
figma-bridge retarget --check   verify every reference names the target file
figma-bridge retarget <key> [n] point the whole repo at another file
figma-bridge audit-coverage     every component mapped, or declared with a reason
figma-bridge audit-snippets     every snippet imports what it renders
figma-bridge doctor             is this repo wired up?
figma-bridge guard --pre-write | --post-write
```

The one file that makes them repo-specific is `figma-bridge.json`; the template is in
`scripts/figma-bridge/templates/`.

## Developing

```bash
./tests/run.sh                          # 19 cases against a throwaway fixture repo
claude plugin validate .                # both manifests
```

The fixture suite asserts both directions of every check: the clean fixture passes, and an invented
component, a stale declaration, a mapping onto a retired page, a snippet missing an import, a
relative import, a doc-link naming another file, a cache from another file and a malformed config
each fail with the message that explains them. Both guards are tested for firing *and* for staying
silent in a repo with no config.

**Bump `version` in `.claude-plugin/plugin.json` in any PR that changes a shipped file.** Claude
Code decides whether to re-download by comparing that string, so a change merged under an unchanged
version never reaches anyone — and reports the stale copy as already up to date. CI enforces it.
Versions only go up, and a version string is never reused.
