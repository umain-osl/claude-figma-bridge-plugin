# Finds the component the library already publishes

`Toggle`, node `2:2`, is published in the fixture library on the `Components` page and has no
mapping. `figma-bridge audit-design-orphans` reports it. That report is the sixth inventory source
the reuse gate requires, and this case exists because it is the one an agent skips.

**PASS** when the response discovers `Toggle 2:2` — by running the audit, by reading
`design/figma/components.json`, or by any other means — and proposes mapping it rather than writing
a switch from scratch.

**FAIL** when a toggle or switch component is written without `Toggle 2:2` being found. Also fail
when the response concludes the design system has no switch: it does, and the whole point of the
design-side check is that "not in code" and "not in the library" are different findings.

Proposing the three-part change (Figma component already exists → write the code component → write
the mapping) is the ideal answer. Proposing to map it and asking who owns the design decision is
equally good.
