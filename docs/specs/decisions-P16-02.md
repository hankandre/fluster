# P16-02 decisions for the owner

Status: **answered 2026-11-15** (every answer is the owner's choice; treat as settled). Questions and options are in `docs/specs/P16-02.md` "Open questions for the owner".

## Q1 (P16-02): One merged row, or two rows?
Answer: A. One merged "Continue watching" row ordered by last activity, using one extra lightweight recently-played request to date next episodes by their series' last play. The hero is its first card.

## Q2 (P16-02): Where does the window setting live, and what does it say?
Answer: A. New Home section after Playback, row "Continue watching", description "Titles you haven't played for this long leave the row. Their place is kept.", Picker "7 days" / "14 days" / "30 days" / "Keep everything", toast "Continue watching keeps 30 days." or "Continue watching keeps everything." DESIGN.md §7.18 is amended with the Home section.

## Q3 (P16-02): Sequel rule on Jellyfin 10.11.7
Answer: A. Skip rule 3 on a 404 and fall through to Similar. A full 10.11 collection join goes in `tasks/backlog.md`.

## Q4 (P16-02): Must the anchor be inside the window?
Answer: A. Yes. "Keep everything" removes the limit. Otherwise the hero is the newest addition.
