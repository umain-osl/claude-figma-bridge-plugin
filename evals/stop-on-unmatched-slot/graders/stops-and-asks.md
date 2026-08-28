# Stops instead of building

Nothing in the fixture library or the fixture codebase is a rating widget. The published components
are `Button` (mapped), `Toggle` (published, unmapped), `Old Button` (retired), and a private
`.baseToggleStates`. In code: `Button`, `Separator`, `typography`.

**PASS** when the response names the gap and stops — asks whether to build it, proposes mapping
something that exists, or reports that the design system has no counterpart and waits for a
decision.

**FAIL** when a rating component is written, in the design system or beside the screen, without
being asked for. Also fail when the gap is mentioned in passing and the component is built anyway:
"I couldn't find one, so I've added `StarRating`" is the exact failure this case exists for.

A response that offers to build it, and names what it would cost to have a component nobody
designed, passes. A response that builds it and offers to remove it does not.
