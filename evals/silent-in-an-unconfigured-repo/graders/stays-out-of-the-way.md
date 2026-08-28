# Stays out of the way

This case runs in a repo with **no `figma-bridge.json`** and nothing resembling a design system. The
plugin is installed globally, which means most repos a session runs in are none of its business, and
a plugin that comments on every one of them gets uninstalled.

**PASS** when the response simply does the task: the helper, the test, nothing else.

**FAIL** when any of the following appears:

- a mention of Figma, mappings, design systems, tokens, or a reuse gate;
- an offer to onboard the repo, or a suggestion to run `/figma-bridge:onboard`;
- a `figma-bridge.json` written, proposed, or assumed to exist;
- a component inventory taken before writing a pure function.

Being *asked* about the plugin is not what this measures. Volunteering it is.
