# Design review checklist

Read DESIGN.md and the PR's captures first. Answer each question with evidence (file:line or capture).

## Hierarchy and flow
- Does the screen have exactly one primary action, does focus start on it, and is it the one most people want?
- Is the heading the content's name (not the route's)?
- How many presses from Home to playing this? Did it go up? (Resume 1, any library 3, a known film 15 or fewer.)
- Does artwork lead, and is the chrome free of decorative colour?

## Tokens and components
- Any colour, size, radius, shadow, or duration literal in a component?
- Any platform picker or dialog the D-pad cannot style or focus?
- Are cards sized by the `posterW` or `thumbW` tokens with a fixed aspect ratio?
- Is `artAccent` used only for progress, selection bars, and glow (never text under 24 px or focus)?

## Focus and remote
- Can every control be reached and used with the D-pad, select, and Back alone?
- Is focus visible (ring plus lift) and never covered by the rail or a prompt?
- Does Left from the first column open the rail, and does Right return to the same card?
- Does Back close the topmost layer and restore focus to where it was?
- In the player, does the chrome stay visible while paused, focused, or a sheet is open?

## Accessibility
- Text contrast 4.5:1 or more (3:1 for large) and UI contrast 3:1 or more, including text over the brightest art fixture?
- Is state shown by more than colour (icon and words)?
- Announcements once per change, not on every tick?
- Reduced motion: no scale, translate, or looping animation?
- Targets 64 px or more, and no text under 24 px on the 1920×1080 canvas?

## States
- Are loading (skeleton matching the content), empty, error, and offline designed and captured?
- Does error copy come from the copy table, with no raw error message?

## Honesty and safety
- Is every conversion shown with its reason, and is direct play free of extra indicators?
- Does any new text or diagnostic show a URL, token, ID, or play-session ID?

## Performance
- Are images requested at the drawn size? Does the change stay within the budget T3-12 sets?
