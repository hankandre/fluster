# T2-02 decisions

## Does acceptance item 5 ("the only task in progress") block on the T0 spikes?

Decided 2026-11-20 by the coordinator, on the owner's instruction to keep building non-UI work. The owner may veto it.

Item 5 applies to agent tasks that change repository code on `main`. T0-01 to T0-04 are the owner's `human: true` spikes on `spike/*` branches and touch no file on `main`, so they stay `in_progress` and do not block T2-02. The rule exists to prevent merge conflicts with the move, and the spikes cannot conflict. The reviewer checks that no other agent task is in progress. The acceptance text is unchanged, and the PR states this reading.
