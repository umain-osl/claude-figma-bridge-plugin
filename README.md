<p align="center">
  <img src="docs/assets/banner.png" alt="figma-bridge" width="720">
</p>

<p align="center">
  <strong>the component already exists — find it</strong>
</p>

<p align="center">
  A Claude Code plugin for the two-way Figma ↔ code workflow.<br>
  Code Connect mappings are the substrate both directions read, so an agent handed a design<br>
  reaches for the component that is already there instead of writing a parallel one.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/node-20%2B-3c873a?style=flat" alt="Node 20+">
  <img src="https://img.shields.io/badge/dependencies-0-4dd6b0?style=flat" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/skills-6-blue?style=flat" alt="6 skills">
  <img src="https://img.shields.io/badge/design_system-any-8957e5?style=flat" alt="Any design system">
</p>

<p align="center">
  <a href="#see-it">See it</a> ·
  <a href="#install">Install</a> ·
  <a href="#what-it-actually-does">What it does</a> ·
  <a href="#skills">Skills</a> ·
  <a href="#the-checks">Checks</a> ·
  <a href="#developing">Developing</a> ·
  <a href="#license">License</a>
</p>

---

## See it

Same request, same design, same repo. The difference is whether the mapping exists and something
enforces it.

<table>
<tr>
<th width="50%">🙈 Without the bridge</th>
<th width="50%">🔗 With figma-bridge</th>
</tr>
<tr>
<td valign="top">

> **"Build the pricing screen from this Figma frame, using the plan card."**
>
> Searches for `PlanCard`. Finds nothing under that name.
> Writes one — 90 lines, reasonable, in the house style.
>
> Nobody designed it. No Figma node governs its tokens. The
> next agent building a screen cannot find it from a design.
> Discovered in review, three days later.

</td>
<td valign="top">

> **"Build the pricing screen from this Figma frame, using the plan card."**
>
> Resolves the frame's Code Connect links first: every mapped
> instance comes back with the component it renders.
> The card the designer used is already linked — under a
> different name.
>
> Produces a mapping table for every slot, and stops on the
> one slot that has no match instead of inventing it.

</td>
</tr>
</table>

And if it invents one anyway, the write itself fails:

```
Components with no Figma counterpart and no declaration:

  PlanCard  (src/design-system/PlanCard.tsx)

Each one needs a Figma component plus a mapping beside it, or an entry in
design/figma/unmapped-components.json explaining why it has no counterpart. Do not add the
declaration to silence this check — an unmapped component is a design decision, so ask first.
```

That is a `PostToolUse` hook, not a suggestion in a prompt. An instruction is a request; a hook is
enforcement.

## Install

```
/plugin marketplace add umain-osl/claude-figma-bridge-plugin
/plugin install figma-bridge@figma-bridge
```

Then, in the repo you want it to work in:

```
/figma-bridge:onboard <figma file url>
```

Onboarding is where the repo-specific facts get written down once. It detects the design system,
writes `figma-bridge.json`, snapshots the Figma library, writes the repo's own token map and
library notes, and vendors the checks into `scripts/figma-bridge/` so CI can run them without the
plugin installed.

<details>
<summary><strong>What onboarding leaves behind</strong> — six artifacts, all in your repo</summary>

| Artifact | Holds |
| --- | --- |
| `figma-bridge.json` | design system roots, the Figma file key, which page is retired, the verify commands |
| `design/figma/unmapped-components.json` | components deliberately without a counterpart, each with a written reason |
| `design/figma/components.json` | a committed snapshot of the published Figma components |
| `design/figma/tokens.md` | how this repo's tokens and typography correspond to Figma's variables |
| `design/figma/library-notes.md` | the things about this library a name does not tell you |
| `scripts/figma-bridge/` | the checks, vendored — zero dependencies, so CI needs nothing |

Paths are configurable; those are the defaults.

</details>

## What it actually does

**Figma → code.** Resolve the Code Connect links *before* reading the design, so the components
come from the mappings rather than from a reconstruction of the markup. Honour the designer's
annotations. Carry no hex value and no raw pixel value across — the repo's token map is the only
route from a Figma variable to code.

**Code → Figma.** Push a screen back as real instances of the library with every value bound to a
variable, not a drawing that resembles the screen. Then compare against the designer's frame and
report the differences — sometimes the generated frame is the correct one, because the old frame
uses a component that has since been retired.

**Both directions rest on the mappings**, which is why the plugin spends as much effort on
authoring them as on using them: the parser-form-first recipe, the three defects
`figma connect migrate` reliably introduces, and an audit for the class of fault that publishes
cleanly and only breaks when someone pastes the snippet.

### Generic plugin, specific repo

Every fact about a particular library lives in your repo, not in here. No component name, node id,
font family or utility class appears anywhere in this plugin as a fact.

| In the plugin | In your repo |
| --- | --- |
| the reuse gate and the mapping table it demands | `figma-bridge.json` |
| the Code Connect recipe and `migrate`'s defects | `tokens.md` — this library's variables → your tokens |
| the Plugin API traps and the missing-font technique | `library-notes.md` — names that mislead |
| the checks, the guards, the doctor | the committed component snapshot |

## Skills

| Skill | Use |
| --- | --- |
| `figma-bridge-onboard` | bootstrap a repo — config, vendored checks, library snapshot, token map |
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

## The hooks

All three no-op in a repo without a `figma-bridge.json`, so the plugin is safe to install globally.

| Hook | Fires | Does |
| --- | --- | --- |
| target guard | `PreToolUse` on the Figma write tools | denies a write to any file but the configured target; fails closed |
| coverage guard | `PostToolUse` on `Write`/`Edit` under the design system roots | reports an invented component at the moment of the write |
| snippet guard | `PostToolUse` on `Write`/`Edit` of a mapping | reports a snippet that renders an identifier it does not import |

## The checks

`scripts/figma-bridge/` is a zero-dependency Node CLI (Node 20+). Plugin installs run no package
manager, and a script inside a plugin directory cannot resolve the host repo's `node_modules` — so
the checks depend on nothing but Node itself, and keep working in a repo whose CI installs with
`--omit=dev`.

```
figma-bridge check              retarget --check, then both audits
figma-bridge retarget --check   verify every reference names the target file
figma-bridge retarget <key> [n] point the whole repo at another file
figma-bridge audit-coverage     every component mapped, or declared with a reason
figma-bridge audit-snippets     every snippet imports what it renders
figma-bridge doctor             is this repo wired up?
figma-bridge guard --pre-write | --post-write
```

<details>
<summary><strong>What each audit catches</strong></summary>

**`audit-coverage`** — a component under the design system roots with neither a mapping nor a
declared reason (the anti-invention guard), a declaration left behind after its file was deleted,
and any mapping pointing at a component on a retired page. That last one matters more than it
sounds: a retired page holds what used to be everywhere, so it accumulates the highest instance
counts in a mature library — rank candidates by popularity and you get dead components first.

**`audit-snippets`** — every identifier a published snippet renders must be imported, and no import
may be relative, because a snippet is pasted somewhere else. This is the fault `figma connect
migrate` introduces systematically and nothing else catches: the template is valid JavaScript, and
`publish` accepts it.

**`retarget --check`** — the file key appears in the config, in every mapping's `// url=` directive,
in every component doc-link and in the component cache. All four must agree, because a partial
rewrite publishes a mixture, or sends a developer to the wrong library.

</details>

## Developing

```bash
./tests/run.sh              # 19 cases against a throwaway fixture repo
claude plugin validate .    # both manifests
```

Every case asserts both directions: the clean fixture passes, and an invented component, a stale
declaration, a mapping onto a retired page, a snippet missing an import, a relative import, a
doc-link naming another file, a cache from another file and a malformed config each fail with the
message that explains them. Both guards are tested for firing *and* for staying silent in a repo
with no config.

The banner is generated, not hand-drawn — edit `docs/assets/banner.html` and re-render:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --force-device-scale-factor=2 --window-size=720,180 \
  --screenshot="$PWD/docs/assets/banner.png" "file://$PWD/docs/assets/banner.html"
```

**Bump `version` in `.claude-plugin/plugin.json` in any PR that changes a shipped file.** Claude
Code decides whether to re-download by comparing that string, so a change merged under an unchanged
version never reaches anyone — and reports the stale copy as already up to date. CI enforces it.
Versions only go up, and a version string is never reused.

## License

All rights reserved. Public so it can be installed, not so it can be reused — no licence is
granted to copy, modify or redistribute it.

---

<p align="center">
  <sub>Not affiliated with or endorsed by Figma. "Figma" and "Code Connect" are Figma's marks,<br>
  used here only to say what this plugin talks to.</sub>
</p>
