---
description: Wire this repo into the two-way Figma workflow — detect the design system, write figma-bridge.json, vendor the checks, snapshot the library
argument-hint: "[figma file url]"
---

Onboard this repository into the Figma Bridge workflow.

Follow the `figma-bridge-onboard` skill exactly, in order. Do not skip the inventory steps to get
to authoring mappings sooner — a mapping written before the inventory exists is a guess, and the
checks cannot tell you it is wrong.

Figma file, if given: $1

If it was not given, ask for it along with the other facts step 0 of the skill lists, in one
message, and wait. Those facts cannot be detected and every later step depends on them.

Report at the end:

- the config you wrote, and any value you had to guess
- what `figma-bridge doctor` and `figma-bridge check` say
- the list of components with no Figma counterpart — the onboarding backlog, and a question for the
  design owner rather than something to clear by declaring entries
