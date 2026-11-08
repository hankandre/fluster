# Design review checklist

Read DESIGN.md and the PR's screenshots first. Answer each question with evidence (file:line or screenshot).

## Hierarchy and flow
- Does the screen have exactly one primary action, and is it the one most people want?
- Is the `h1` the content's name (not the route's)?
- How many activations from Home to playing this? Did it go up?
- Does artwork lead, and is the chrome free of decorative colour?

## Tokens and components
- Any colour, size, radius, shadow, or duration literal in feature CSS?
- Any native select, radio, or checkbox, or a bare element selector?
- Are cards sized by `--poster-w` or `--thumb-w` with an aspect-ratio frame?
- Is `--art-accent` used only for progress, selection bars, and glow (never text under 24 px or focus)?

## Focus and input
- Can every control be reached and used with arrows, Enter, and Escape alone?
- Is focus visible (ring plus lift) and never covered by the nav or a prompt?
- Does Back close the topmost layer and restore focus to where it was?
- Is every hover-revealed control also revealed on focus?
- In the player, does the chrome stay visible while paused, focused, or a panel is open?

## Accessibility
- Text contrast 4.5:1 or more (3:1 for large) and UI contrast 3:1 or more, including text over the brightest art fixture?
- Is state shown by more than colour (icon, text, and ARIA state)?
- Live regions announce once per change, not on every tick?
- `prefers-reduced-motion`: no scale, translate, or looping animation?
- Targets 44 px or more (TV 64 px or more)?

## States
- Are loading (skeleton matching the content), empty, error, and offline designed and shown in screenshots?
- Does error copy come from the copy table, with no raw `Error.message`?

## Honesty and safety
- Is every conversion shown with its reason (`ConversionChip`, Info), and is direct play free of extra indicators?
- Does any new text, tooltip, or diagnostic show a URL, token, ID, or play-session ID?

## TV readiness
- Does the screen work in `data-form="tv"` within title-safe insets with no text under 22 px?
- Does anything depend on hover or pointer position?
