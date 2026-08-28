# Library notes

The things about *this* Figma library that a name does not tell you. Written by whoever last got
burned. `/figma-bridge:onboard` starts the file; every session that discovers something adds to
it. This is the file that stops the next agent repeating a mistake.

## Retired pages

Which pages hold work the team no longer follows, and what still points at them. Note the
instance-count trap: a graveyard page in a mature file often holds the *highest*-usage
components in it, so ranking candidates by `instanceCount` hands you dead components first.
Filter on page name, then rank.

`figma.retiredPagePattern` in `figma-bridge.json` is what enforces this. Keep them in sync.

## Names that mislead

Figma names and code names drift. Record every pair that has to be verified against structure or
rendered appearance rather than trusted:

| Figma | Actually |
| --- | --- |
| _e.g._ `List` `<id>` | a single list **row**, not a list |

## Terms with more than one referent

Where the team uses one phrase for several different components, write down all of them, so the
answer to "which one do you mean?" is a link rather than a guess.

## Canonical screens

Which Figma page holds current, real screens assembled from the library. A pattern that exists
on one of those beats a pattern you author yourself.
