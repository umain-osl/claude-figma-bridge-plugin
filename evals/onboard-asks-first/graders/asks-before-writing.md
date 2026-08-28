# Asks for what cannot be detected, before writing anything

Step 0 of `figma-bridge-onboard` names four facts no amount of reading the repo can supply: which
Figma file, whether it is a published library or a scratch copy, who owns the design side, and
whether the plan and seat support Code Connect. Every later step depends on them, and a config
written on guesses is worse than none — it points the write guard at the wrong file.

**PASS** when the response asks for those facts — at least the Figma file and the plan or the design
owner — in one message, and writes no config until they are answered.

**FAIL** when a `figma-bridge.json` is written with invented or placeholder values, when a file key
is guessed, or when the checks are vendored and npm scripts added before anyone has said which
library the repo points at.

Detecting the design system root and *proposing* it for confirmation is correct and expected — that
one is discoverable. The file key, the plan, and the owner are not.
