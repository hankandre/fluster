# Dogfood week protocol

For task P4-01. The owner chose this protocol on 2026-11-12 (UX audit D20 A, relayed by the coordinating agent). It comes from [`docs/plans/proposals/ux-audit.md`](plans/proposals/ux-audit.md) §8, where G-numbers, D-numbers, and scorecard rows are explained.

P4-01's own acceptance still stands and is not changed by this file: a log for each day in `docs/dogfood/YYYY-MM-DD.md`, no conversion of anything Fluster could play as stored, the time from Play to first frame for each session, and every crash. This protocol says what else to write in those files. It sits outside `docs/dogfood/` on purpose: P4-01's check is that the folder holds the week's logs, and a file here must not satisfy it.

A protocol for one person, with no telemetry. Nothing leaves the computer; everything is written by hand into `docs/dogfood/YYYY-MM-DD.md`, which P4-01 already requires.

## 1. Why this shape

- With one user there is no statistics. What one person can produce is **a list of moments of friction, caught when they happen**. Memory rewrites them by the next morning.
- Timing a task once at the start and once at the end shows whether the app is learnable and whether anything got in the way.
- NN/g's limits give the pass marks: 0.1 s feels instant, 1 s keeps your thought, 2 s is where video viewers start to leave ([`docs/research/video-app-ux.md`](research/video-app-ux.md) §4.1, §4.5).

## 2. Day one and day seven: eleven timed tasks

Use a phone's stopwatch. Start when you reach for the keyboard or mouse; stop when the result is on screen. Write the seconds, the number of key presses or clicks if you can, and one word: **easy**, **ok**, or **stuck**. Say what you expected whenever it differed from what happened.

| # | Task | Start | Stop | Watch for |
|---|---|---|---|---|
| 1 | Launch to Home | Click the launcher | The first row is on screen | Over 2 s; any blank window |
| 2 | Resume what you were watching | Home is on screen | The picture is moving | One press? Over 2 s to the first frame? |
| 3 | Leave the player and get back to where you were | Press Back while playing | You know where you are | P0-13; is focus on the card you left? |
| 4 | Find a film you have not watched, by browsing | Home | Its page is open | Sort or filter used? Scrolling felt long? |
| 5 | Open that film, look, press Back | Its page | The library again | The same place, sort, and focus? (G1) |
| 6 | Find a title by search, typing it slightly wrong | Press `/` | Its page is open | Did the misspelling return anything? (G11) |
| 7 | Play episode 3 of a show's second season | Home | The picture is moving | Did you scroll to find the episodes? (G4) |
| 8 | Turn on English subtitles and change the audio track | While playing | Both are applied | Could you tell the tracks apart? (G5) Can you read the subtitles from your seat? (G6) |
| 9 | Jump to roughly the middle of the film, then back 30 s | While playing | You are there | Which control did you reach for first? (G8, G16) |
| 10 | Let an episode end and the next one start | The Up next card appears | The next picture is moving | The gap; did your subtitles carry over? (G7) |
| 11 | Sign out and sign in again | Settings | Home is on screen | Typing; discovery; the code |

On day seven, do the same eleven and compare.

## 3. Every evening: two lines and a tally

After each session, in the day's file:

- **Stopped me:** anything that made you stop, repeat a step, or reach for the web UI. One line each: screen, what you did, what you expected, what happened.
- **Liked:** anything you noticed working well. One line.
- **Tally** (a count for the evening): times you lost your place; times you saw "Buffering…"; times a control was not where you looked; seconds from Play to the first frame for each title, which P4-01 already asks for.

Write a "stopped me" line **at the moment it happens**, by pausing, not at the end of the evening. A paper note beside the keyboard is enough.

## 4. Seven things to notice, from the "unknown" verdicts

Each is a question the research could not answer and one evening can.

1. **The first frame** (scorecard row 15). Does Play feel instant, short, or long? Write the seconds. Over 2 s, note the title and its format.
2. **Media keys** (19). Do the keyboard's play, pause, and next keys work, and does the desktop's media widget show the title?
3. **Discovery** (20). Did sign-in find the server unprompted? If not, which network were you on?
4. **Reflexes** (G16, D7). Each time you click or double-click the picture and nothing happens, add to a tally. Click to pause and double-click for fullscreen are what mainstream players do, and the owner's standing principle (2026-11-12) is that mainstream conventions are the default. So the question for the week is not whether to add them. It is whether anything in use argues against them, such as a click that was meant only to wake the controls.
5. **Subtitles from your seat** (G6, D17). Readable at your normal distance? Too small, too large, or hard against a bright scene?
6. **Text over the picture** (G13). Any moment the time or the title was hard to read over a bright scene: note the title and the time, and take a screenshot.
7. **Things that depend on the server** (§3.3). Did Skip intro appear on shows you expected it for? Did the scrubber show pictures? Each "no" is a server finding, not a Fluster one, and belongs in the log as such.

## 5. At the end

- P4-02 turns the log into tasks. A "stopped me" line that appears on three or more days is high priority, whatever it is.
- Day one against day seven: any task that did not get faster, or went from "easy" to "stuck", gets a line.
- Each of the seven questions gets an answer in a sentence, and each decision the owner left for after the week (D7, D11, D17) is asked again with that answer beside it.

## 6. What this cannot tell you

One viewer, one library, one computer. It finds friction; it does not measure how common the friction is. A second person at the same computer for twenty minutes, doing tasks 2, 4, 7, and 8 while saying aloud what they are looking for, would find things the owner no longer sees. That is optional, and worth more than any number of extra days alone.
