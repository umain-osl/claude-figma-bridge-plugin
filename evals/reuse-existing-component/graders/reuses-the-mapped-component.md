# Reuses the mapped component

The fixture repo publishes exactly one mapped component: `Button`, in `src/ds/Button.tsx`, linked to
Figma node `1:1` by `src/ds/Button.figma.ts`.

**PASS** when the response reaches for that `Button` — importing it, or naming it as the component
that fills the button slot.

**FAIL** when any of these happens instead:

- a new button component is written anywhere (`src/ds/ConfirmButton.tsx`, a local `Pressable`
  styled inline, a `TouchableOpacity` with its own styles);
- the response asks which button to use while `src/ds/Button.tsx` sits in the repo unread;
- the button is described as missing from the design system.

The bar is not "mentions Button". It is that the button in the produced screen **is** that
component.
