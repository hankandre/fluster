import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import type { MediaTrack, PlaybackPlan, PlaybackSnapshot, PlayerTrack } from "../../domain/playback";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { PlayerRouteView } from "./index";

// P10-08: track and streaming-limit changes during playback.

const detail: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};

// Video 0, English audio 1, French audio 2, English SRT 3, English PGS 4.
const sourceTracks: MediaTrack[] = [
  { index: 0, type: "Video", displayTitle: "H.264", external: false },
  { index: 1, type: "Audio", displayTitle: "English", external: false },
  { index: 2, type: "Audio", displayTitle: "French", external: false },
  { index: 3, type: "Subtitle", displayTitle: "English SRT", external: false, deliveryUrl: "https://media.test/sub.srt" },
  { index: 4, type: "Subtitle", displayTitle: "English PGS", external: false },
];

function directPlan(playSessionId = "play-1", extra: Partial<PlaybackPlan> = {}): PlaybackPlan {
  return {
    itemId: "m1",
    title: "Arrival",
    streamUrl: "https://media.test/Videos/m1/stream?Static=true",
    mediaSourceId: "src-hd",
    authorization: 'MediaBrowser Client="Fluster", Token="test"',
    playSessionId,
    startPositionTicks: 0,
    tracks: sourceTracks,
    defaultAudioStreamIndex: 1,
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
    ...extra,
  } as PlaybackPlan;
}

function convertedPlan(playSessionId = "play-1", extra: Partial<PlaybackPlan> = {}): PlaybackPlan {
  return {
    ...directPlan(playSessionId),
    streamUrl: "https://media.test/videos/m1/master.m3u8",
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["AudioCodecNotSupported"],
    serverUrl: "https://media.test",
    mediaKind: "videos",
    ...extra,
  } as PlaybackPlan;
}

const englishAudio: PlayerTrack = { playerId: 1, jellyfinIndex: 1, type: "Audio", title: "English", external: false, selected: true };
const srt: PlayerTrack = { playerId: 1, jellyfinIndex: 3, type: "Subtitle", title: "English SRT", external: true, selected: false };

function snapshotWith(tracks: PlayerTrack[]): PlaybackSnapshot {
  return {
    positionSeconds: 42,
    durationSeconds: 120,
    paused: false,
    buffering: false,
    volume: 100,
    muted: false,
    tracks,
    diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
  };
}

// What mpv lists on the conversion: the requested audio and the SRT file.
const convertedSnapshot = snapshotWith([englishAudio, srt]);

// Records negotiations, reports, and encode stops in order.
function orderedGateway(order: string[], plans: PlaybackPlan[], overrides: Partial<SessionGateway> = {}): SessionGateway {
  const queue = [...plans];
  return fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail),
    createPlaybackPlan: vi.fn(async (_item, ticks) => {
      const next = queue.shift()!;
      order.push(`negotiate ${ticks} -> ${next.playSessionId}`);
      return next;
    }),
    reportStopped: vi.fn(async (plan: PlaybackPlan, _snapshot, _signal, failed) => {
      order.push(`stopped ${plan.playSessionId} failed=${String(failed)}`);
    }),
    stopActiveEncoding: vi.fn(async (playSessionId: string) => { order.push(`delete ${playSessionId}`); }),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderPlayer(gateway: SessionGateway, engine: FakePlayerEngine, limits = new MemoryStreamingLimits()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider createGateway={() => gateway}>
        <PlayerServicesProvider services={{ engine }}>
          <PreferencesProvider preferences={{ streamingLimits: limits }}>
            <SignIn gateway={gateway} />
            <PlayerRouteView itemId="m1" mediaSourceId="src-hd" startTicks={0} />
          </PreferencesProvider>
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

async function startPlaying(engine: FakePlayerEngine, snapshot: PlaybackSnapshot, launches = 1) {
  await waitFor(() => expect(engine.launch).toHaveBeenCalledTimes(launches));
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot });
    engine.emit({ kind: "first-frame" });
  });
}

async function choose(label: "Audio track" | "Subtitle track", value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

function negotiationOptions(gateway: SessionGateway, call: number) {
  return vi.mocked(gateway.createPlaybackPlan).mock.calls[call];
}

beforeEach(() => {
  window.location.hash = "#/next/play/m1?source=src-hd";
});

afterEach(cleanup);

describe("track changes while converting", () => {
  it("offers the source's streams, not only the ones mpv lists", async () => {
    const engine = new FakePlayerEngine();
    await renderPlayer(orderedGateway([], [convertedPlan()]), engine);
    await startPlaying(engine, convertedSnapshot);

    const audio = screen.getByLabelText<HTMLSelectElement>("Audio track");
    expect([...audio.options].map((option) => option.text)).toEqual(["English", "French"]);
    expect(audio.value).toBe("1");
    const subtitles = screen.getByLabelText<HTMLSelectElement>("Subtitle track");
    expect([...subtitles.options].map((option) => option.text)).toEqual(["Subtitles off", "English SRT", "English PGS"]);
  });

  it("renegotiates at the current position for audio the conversion lacks, after stopping the old session and its encode", async () => {
    const order: string[] = [];
    const gateway = orderedGateway(order, [convertedPlan("play-1"), convertedPlan("play-2", { defaultAudioStreamIndex: 2 })]);
    const engine = new FakePlayerEngine();
    engine.stop.mockImplementation(async () => { order.push("player stop"); });
    await renderPlayer(gateway, engine);
    await startPlaying(engine, convertedSnapshot);

    await choose("Audio track", "2");

    await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(convertedPlan("play-2", { defaultAudioStreamIndex: 2 })));
    expect(order).toEqual([
      "negotiate 0 -> play-1",
      "player stop",
      "stopped play-1 failed=false",
      "delete play-1",
      "negotiate 420000000 -> play-2",
    ]);
    expect(negotiationOptions(gateway, 1)).toEqual([
      expect.objectContaining({ id: "m1" }),
      420_000_000,
      expect.any(AbortSignal),
      "src-hd",
      { ignoreStreamingLimit: false, audioStreamIndex: 2, subtitleStreamIndex: -1 },
    ]);
    expect(engine.selectTrack).not.toHaveBeenCalled();
  });

  it("switches in mpv to audio the conversion carries", async () => {
    const gateway = orderedGateway([], [convertedPlan()]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    const french: PlayerTrack = { playerId: 2, jellyfinIndex: 2, type: "Audio", title: "French", external: false, selected: false };
    await startPlaying(engine, snapshotWith([englishAudio, french, srt]));

    await choose("Audio track", "2");

    expect(engine.selectTrack).toHaveBeenCalledWith("audio", 2);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
  });

  it("switches in mpv to a carried subtitle and to off", async () => {
    const gateway = orderedGateway([], [convertedPlan()]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine, convertedSnapshot);

    await choose("Subtitle track", "3");
    expect(engine.selectTrack).toHaveBeenLastCalledWith("subtitle", 1);
    await act(async () => {
      engine.emit({ kind: "tracks-changed", snapshot: snapshotWith([englishAudio, { ...srt, selected: true }]) });
    });
    await choose("Subtitle track", "off");
    expect(engine.selectTrack).toHaveBeenLastCalledWith("subtitle", undefined);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
  });

  it("renegotiates for a subtitle the conversion lacks, keeping the audio", async () => {
    const order: string[] = [];
    const gateway = orderedGateway(order, [convertedPlan("play-1"), convertedPlan("play-2")]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine, convertedSnapshot);

    await choose("Subtitle track", "4");

    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
    expect(negotiationOptions(gateway, 1)[4]).toEqual({ ignoreStreamingLimit: false, audioStreamIndex: 1, subtitleStreamIndex: 4 });
    expect(order.indexOf("delete play-1")).toBeLessThan(order.indexOf("negotiate 420000000 -> play-2"));
  });

  it("renegotiates without burn-in when subtitles are turned off", async () => {
    const order: string[] = [];
    const burned = convertedPlan("play-1", { subtitlesBurnedIn: true, defaultSubtitleStreamIndex: 4 });
    const gateway = orderedGateway(order, [burned, convertedPlan("play-2")]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine, snapshotWith([englishAudio]));
    expect(screen.getByLabelText<HTMLSelectElement>("Subtitle track").value).toBe("4");

    await choose("Subtitle track", "off");

    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
    expect(negotiationOptions(gateway, 1)[4]).toEqual({ ignoreStreamingLimit: false, audioStreamIndex: 1, subtitleStreamIndex: -1 });
    expect(order.slice(1)).toEqual(["stopped play-1 failed=false", "delete play-1", "negotiate 420000000 -> play-2"]);
    expect(engine.selectTrack).not.toHaveBeenCalled();
  });

  it("Back during a renegotiation leaves at once and never launches the new session", async () => {
    let negotiations = 0;
    let negotiationSignal: AbortSignal | undefined;
    const gateway = orderedGateway([], [], {
      createPlaybackPlan: vi.fn((_item, _ticks, signal?: AbortSignal) => {
        negotiations += 1;
        if (negotiations === 1) return Promise.resolve(convertedPlan("play-1"));
        negotiationSignal = signal;
        // A server that never answers; the request ends only when aborted, as Axios does.
        return new Promise<PlaybackPlan>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
      }),
    });
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    await startPlaying(engine, convertedSnapshot);

    await choose("Audio track", "2");
    await waitFor(() => expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    });

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(negotiationSignal?.aborted).toBe(true);
    expect(engine.launch).toHaveBeenCalledTimes(1);
  });
});

describe("track changes during direct play", () => {
  it("stay local in mpv and never ask the server", async () => {
    const gateway = orderedGateway([], [directPlan()]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine);
    const french: PlayerTrack = { playerId: 2, jellyfinIndex: 2, type: "Audio", title: "French", external: false, selected: false };
    await startPlaying(engine, snapshotWith([englishAudio, french, srt]));

    await choose("Audio track", "2");
    await choose("Subtitle track", "1");

    expect(engine.selectTrack).toHaveBeenNthCalledWith(1, "audio", 2);
    expect(engine.selectTrack).toHaveBeenNthCalledWith(2, "subtitle", 1);
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);
    expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
  });
});

describe("streaming limit changes during playback", () => {
  // The fake gateway's server is public, so the remote limit applies.
  it("renegotiate a conversion at the current position with the playing streams", async () => {
    const order: string[] = [];
    const limits = new MemoryStreamingLimits();
    const gateway = orderedGateway(order, [convertedPlan("play-1"), convertedPlan("play-2")]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, limits);
    await startPlaying(engine, snapshotWith([englishAudio, { ...srt, selected: true }]));

    await act(async () => {
      limits.set({ remoteMbps: 4 });
    });

    await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(convertedPlan("play-2")));
    expect(negotiationOptions(gateway, 1)[1]).toBe(420_000_000);
    expect(negotiationOptions(gateway, 1)[4]).toEqual({ ignoreStreamingLimit: false, audioStreamIndex: 1, subtitleStreamIndex: 3 });
    expect(order.slice(1)).toEqual(["stopped play-1 failed=false", "delete play-1", "negotiate 420000000 -> play-2"]);
  });

  it("renegotiate direct play only when the new limit is below the file's bitrate", async () => {
    const limits = new MemoryStreamingLimits();
    const gateway = orderedGateway([], [directPlan("play-1", { sourceBitrate: 30_000_000 }), convertedPlan("play-2")]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, limits);
    await startPlaying(engine, snapshotWith([englishAudio]));

    await act(async () => {
      limits.set({ remoteMbps: 40 });
      limits.set({ remoteMbps: 40, localMbps: 2 });
    });
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      limits.set({ remoteMbps: 20, localMbps: 2 });
    });
    await waitFor(() => expect(engine.launch).toHaveBeenLastCalledWith(convertedPlan("play-2")));
    expect(negotiationOptions(gateway, 1)[1]).toBe(420_000_000);
    expect(gateway.stopActiveEncoding).not.toHaveBeenCalled();
  });

  it("leave a session that plays the original against the limit alone", async () => {
    const limits = new MemoryStreamingLimits({ remoteMbps: 4 });
    const gateway = orderedGateway([], [
      convertedPlan("play-1", { conversionReasons: ["ContainerBitrateExceedsLimit"], playOriginalAvailable: true }),
      convertedPlan("play-2"),
    ]);
    const engine = new FakePlayerEngine();
    await renderPlayer(gateway, engine, limits);
    await startPlaying(engine, convertedSnapshot);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play original" }));
    });
    await startPlaying(engine, convertedSnapshot, 2);

    await act(async () => {
      limits.set({ remoteMbps: 2 });
    });
    expect(gateway.createPlaybackPlan).toHaveBeenCalledTimes(2);
  });
});
