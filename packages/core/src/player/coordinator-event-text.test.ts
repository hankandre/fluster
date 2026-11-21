// T2-05 review follow-up (D14): no player text on any event reaches onEvent, the session state or a playstate report.
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEvent } from "../domain/playback";
import { FakeClock } from "../ports/fake-clock";
import { PlaybackCoordinator, type PlaybackGateway } from "./coordinator";
import { createFakePlayerEngine } from "./fake-player-engine";
import { initialPlaybackSessionState, playbackSessionReducer, type PlaybackSessionState } from "./session-state";

const NATIVE_TEXT = "mpv could not open https://media.test/x?api_key=SECRET-TOKEN /home/u/x.mkv";
const LEAKS = ["mpv", "SECRET-TOKEN", "media.test", "/home/u"];

const item: LibraryItem = { id: "one", name: "One", type: "Movie", resumePositionTicks: 0, played: false };
const plan: PlaybackPlan = {
  itemId: "one",
  title: "One",
  streamUrl: "https://server.test/Videos/one/stream?Static=true",
  mediaSourceId: "source",
  playSessionId: "play-1",
  startPositionTicks: 0,
  tracks: [],
  delivery: "static",
  playMethod: "DirectPlay",
  conversionReasons: [],
};
const snapshot: PlaybackSnapshot = {
  positionSeconds: 7,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
};
const dirtySnapshot = { ...snapshot, message: NATIVE_TEXT, diagnostics: { ...snapshot.diagnostics, message: NATIVE_TEXT } } as PlaybackSnapshot;

async function setup() {
  const gateway = {
    createPlaybackPlan: vi.fn(async () => plan),
    reportStart: vi.fn(async () => undefined),
    reportProgress: vi.fn(async () => undefined),
    reportStopped: vi.fn(async () => undefined),
    sessionId: () => "session-1",
    stopActiveEncoding: vi.fn(async () => undefined),
  } satisfies PlaybackGateway;
  const fake = createFakePlayerEngine();
  let state: PlaybackSessionState = initialPlaybackSessionState;
  const onEvent = vi.fn<(event: PlayerEvent) => void>((event) => {
    state = playbackSessionReducer(state, { type: "event", event });
  });
  const onSessionEnded = vi.fn();
  const coordinator = new PlaybackCoordinator(gateway, fake.engine, { onEvent, onReportingError: vi.fn(), onSessionEnded }, new FakeClock());
  await coordinator.start(item);
  return { gateway, fake, onEvent, onSessionEnded, coordinator, state: () => state };
}

function expectNoPlayerText(value: unknown): void {
  const text = JSON.stringify(value);
  for (const leak of LEAKS) expect(text).not.toContain(leak);
}

describe("events other than errors carry no player text", () => {
  it("rebuilds an ended event with a smuggled message before the screen and the session state see it", async () => {
    const { gateway, fake, onEvent, onSessionEnded, coordinator, state } = await setup();
    fake.emit({ kind: "loaded", snapshot: dirtySnapshot });
    fake.emit({ kind: "ended", reason: "error", message: NATIVE_TEXT, snapshot: dirtySnapshot } as unknown as PlayerEvent);
    await coordinator.flush();
    expect(onEvent).toHaveBeenLastCalledWith({ kind: "ended", reason: "error", snapshot });
    expect(onSessionEnded).toHaveBeenCalledWith("error");
    expectNoPlayerText(onEvent.mock.calls);
    expectNoPlayerText(state());
    expectNoPlayerText(gateway.reportStart.mock.calls);
    expectNoPlayerText(gateway.reportStopped.mock.calls);
  });

  it("rebuilds a state event with a smuggled message, keeping its snapshot and cause", async () => {
    const { gateway, fake, onEvent, coordinator, state } = await setup();
    fake.emit({ kind: "loaded", snapshot });
    fake.emit({ kind: "state", snapshot: { ...dirtySnapshot, paused: true }, cause: "pause", message: NATIVE_TEXT } as unknown as PlayerEvent);
    await coordinator.flush();
    expect(onEvent).toHaveBeenLastCalledWith({ kind: "state", snapshot: { ...snapshot, paused: true }, cause: "pause" });
    expect(gateway.reportProgress).toHaveBeenCalledWith(plan, { ...snapshot, paused: true }, expect.any(AbortSignal));
    expectNoPlayerText(onEvent.mock.calls);
    expectNoPlayerText(state());
    expectNoPlayerText(gateway.reportProgress.mock.calls);
  });

  it("never forwards an event kind outside the port's list", async () => {
    const { fake, onEvent, coordinator, state } = await setup();
    fake.emit({ kind: "warning", message: NATIVE_TEXT } as unknown as PlayerEvent);
    fake.emit({ kind: "log", text: NATIVE_TEXT } as unknown as PlayerEvent);
    await coordinator.flush();
    expect(onEvent).not.toHaveBeenCalled();
    expect(state()).toEqual(initialPlaybackSessionState);
  });
});
