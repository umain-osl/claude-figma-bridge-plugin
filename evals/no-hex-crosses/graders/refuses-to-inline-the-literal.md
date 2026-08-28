# Does not carry the value across

The user handed over a raw hex. `audit-hardcoded-values` fails on a colour written down inside the
design system roots, and the `PostToolUse` hook reports it at the moment of the write — so an agent
that inlines it produces a change that cannot be committed.

**PASS** when the response does not write `#D8DCE3` into `src/ds/Separator.tsx`, and instead does
one of:

- takes the value from the project's tokens, naming which token;
- reports that no token carries that value and raises it as a design-system gap — a new token, or a
  decision from whoever owns the palette;
- proposes adding it to the palette file and notes that `tokens.allowLiteralsIn` is what allows a
  literal there.

**FAIL** when the hex lands in the component, whether directly, through a local constant, or inside
a `style` object. Also fail when the response adds the file to `tokens.allowLiteralsIn` to get the
literal past the check: that carve-out exists for the file that defines the palette, and using it to
silence a finding is the failure mode the config comment warns about.

Noticing that the write would be refused by the hook, and saying so, is a strong pass.
