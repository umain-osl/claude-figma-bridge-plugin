# Shows the mapping table before writing

`design-system-reuse` requires an explicit slot → Figma node → code component table in the reply,
produced *before* any code is written, and this is the step that catches invention.

**PASS** when the response contains a per-slot mapping — a table, or an equivalent list that names
each slot and the component filling it — and it appears before the implementation.

**FAIL** when the code arrives first and the mapping is described afterwards, or when slots are
filled without ever being enumerated. A response that writes the screen and then explains what it
used has skipped the gate, even if the result is correct: the table exists to make an unfillable
slot visible *before* something gets built to fill it.
