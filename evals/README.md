# Evals

The fixture suite in `tests/` proves the **checks** work. These cases are about the **skills** —
whether the six prompts in `skills/` actually change what an agent does. That distinction matters
here more than usual: the enforcement layer is deterministic code with 38 tests behind it, while the
skills are around 1,400 lines of prose that regress silently when edited.

## Status: authored, not yet runnable

`claude plugin eval` is in early access and is not enabled on the account this was written on:

```
$ claude plugin eval init --bare reuse-existing-component
`plugin eval` is currently in early access
```

So each case here is the documented minimal form — a `prompt.md` and one or more `graders/*.md` —
and there is deliberately **no `case.yaml`**. Its fields could not be verified, and a suite built on
a guessed schema fails in a way that looks like a failing plugin. Whoever enables the runner adds the
case files, wiring `scaffold_script` to `evals/scaffold.sh` and tagging the cases `offline`.

Nothing here is wasted in the meantime: the graders are the content. They state, in reviewable
English, what each skill is supposed to make happen — which is worth having whether a runner reads
them or a person does.

## The cases

| Case | Asks | Passes when |
| --- | --- | --- |
| `reuse-existing-component` | a screen needing a button, in a repo whose only mapped component is `Button` | the button *is* that component, and a mapping table appears before the code |
| `stop-on-unmatched-slot` | a rating widget, which the library does not publish | it names the gap and stops, rather than building one |
| `orphan-list-consulted` | a settings row with a switch, where `Toggle 2:2` is published but unmapped | it finds `Toggle` and proposes mapping it |
| `no-hex-crosses` | a colour handed over as a raw hex | the literal never reaches the component |
| `silent-in-an-unconfigured-repo` | a pure utility function, no design system anywhere | the plugin says nothing at all |
| `onboard-asks-first` | "set up figma-bridge here", with no Figma file named | it asks for what cannot be detected before writing a config |

The last two are the ones worth keeping honest. A plugin installed globally runs in every repo, so
`silent-in-an-unconfigured-repo` measures a cost the other cases cannot see; and a bad `onboard`
points the write guard at the wrong Figma file, which is the most expensive mistake here.

## Running them, once the runner is available

```bash
claude plugin eval . --tag offline --scaffold
```

Two defaults do the heavy lifting:

- **`--ablation with-without`** runs a no-plugin baseline arm and reports the score delta. That delta
  is the number to watch, not the raw score: a case that passes with and without the plugin is
  measuring the model, not the skill. If `reuse-existing-component` shows no delta,
  `design-system-reuse` is decoration.
- **`--mocks record`** stands in for MCP servers from `evals/mocks/`, which is what lets Figma-shaped
  cases run without a live file or a paid seat. None of the six offline cases need it; the
  Figma-dependent ones below do.

`--runs` defaults to 3, so nondeterminism is averaged rather than hidden.

## Preconditions

Each case needs a different starting repo, and that state is half the test. `evals/scaffold.sh`
builds it:

```bash
./evals/scaffold.sh reuse-existing-component /tmp/case
```

It is a script rather than a paragraph so the preconditions cannot drift away from what the graders
assume.

## Not written yet

Three cases need recorded MCP mocks, and they cover the parts of the workflow with the most room to
go quietly wrong:

- **links resolved first** — `get_code_connect_map` on the frame *before* `get_design_context`, since
  reading the design first is what produces a reconstruction instead of a composition.
- **no DOM capture for a native target** — `generate_figma_design` refused, node ids taken from the
  mappings instead.
- **variables bound, not hardcoded** — the generated Plugin API script uses
  `setBoundVariableForPaint` rather than literal fills.

## Why these are not a required check

Evals cost tokens and are not deterministic. As a required status check at `--threshold 1.0` they
buy flaky merges, and a flaky gate gets bypassed, which costs more than it protects. Run them
nightly, on demand, and before a version bump — and keep the five required checks deterministic.
