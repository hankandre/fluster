import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, LibraryItem, NextEpisode } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { autoPlayOf, continueWindowOf, MemoryPreferenceStore, skipModesOf } from "../../lib/preference-store";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { SIGN_IN_ROUTE } from "../routes";
import { ToastProvider } from "../shared/ui";
import { PlayerRouteView } from "./index";

function episode(id: string, title: string): ItemDetail {
  return { id, type: "Episode", title, seriesId: "s1", seriesName: "Show", genres: [], cast: [], userData: { played: false, favorite: false, resumePositionTicks: 0 }, versions: [] };
}

const second: NextEpisode = { id: "e2", title: "Second", label: "S1 · E2" };

function plan(itemId: string): PlaybackPlan {
  return {
    itemId,
    title: itemId,
    streamUrl: `https://media.test/Videos/${itemId}/stream?Static=true`,
    mediaSourceId: "src",
    playSessionId: `play-${itemId}`,
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
    hasSegments: true,
  };
}

function snapshotAt(positionSeconds: number): PlaybackSnapshot {
  return { positionSeconds, durationSeconds: 1200, paused: false, buffering: false, volume: 100, muted: false, tracks: [], diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 } };
}

function gatewayFor(overrides: Partial<SessionGateway> = {}, next: NextEpisode | undefined = second): SessionGateway {
  return fakeSessionGateway({
    itemDetail: vi.fn(async (id: string) => episode(id, id)),
    nextEpisode: vi.fn().mockResolvedValue(next),
    createPlaybackPlan: vi.fn(async (item: LibraryItem) => plan(item.id)),
    mediaSegments: vi.fn().mockResolvedValue([{ kind: "Intro", startSeconds: 60, endSeconds: 90 }]),
    connect: vi.fn().mockResolvedValue({ name: "Hearth", id: "server-1", version: "10.11.7", hostClass: "public", needsUnencryptedConfirmation: false }),
    ...overrides,
  });
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

function Routes() {
  const { gateway } = useSession();
  return gateway ? <PlayerRouteView itemId="e1" startTicks={0} /> : <p>signed out</p>;
}

async function setup(gateway = gatewayFor(), store = new MemoryPreferenceStore()) {
  const engine = new FakePlayerEngine();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <SessionProvider createGateway={() => gateway}>
          <PlayerServicesProvider services={{ engine }}>
            <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits(), continueWindow: continueWindowOf(store), skipModes: skipModesOf(store), autoPlay: autoPlayOf(store) }}>
              <SignIn gateway={gateway} />
              <Routes />
            </PreferencesProvider>
          </PlayerServicesProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  await waitFor(() => expect(engine.launch).toHaveBeenCalledTimes(1));
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: snapshotAt(10) });
    engine.emit({ kind: "first-frame" });
  });
  return { gateway, engine, store };
}

async function atPosition(engine: FakePlayerEngine, seconds: number) {
  await act(async () => {
    engine.emit({ kind: "loaded", snapshot: snapshotAt(seconds) });
  });
}

async function openSettings(user = userEvent.setup()) {
  await act(async () => {
    fireEvent.keyDown(window, { key: "o" });
  });
  const sheet = await screen.findByRole("region", { name: "Player settings" });
  return { sheet, user };
}

async function openSection(sheet: HTMLElement, name: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(sheet).getByRole("button", { name }));
}

beforeEach(() => {
  window.location.hash = "#/next/play/e1";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function callCounts(gateway: SessionGateway, engine: FakePlayerEngine): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [name, value] of Object.entries(gateway)) {
    const mock = (value as { mock?: { calls: unknown[] } }).mock;
    if (mock) counts[name] = mock.calls.length;
  }
  counts.launch = engine.launch.mock.calls.length;
  counts.stop = engine.stop.mock.calls.length;
  return counts;
}

describe("Settings sheet in the player", () => {
  it("opens on the section list with the five sections, without pausing, and Escape closes it to the button", async () => {
    const { engine } = await setup();
    const { sheet } = await openSettings();
    const nav = within(sheet).getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["Playback", "Home", "Subtitles", "Account", "About & diagnostics"]);
    expect(within(sheet).queryByRole("button", { name: /All settings/ })).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    });
    expect(screen.queryByRole("region", { name: "Player settings" })).toBeNull();
    expect(engine.setPaused).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("Escape steps back from a section to the list, and a second Escape closes the sheet", async () => {
    await setup();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Home", user);
    expect(within(sheet).getByRole("heading", { level: 2, name: "Home" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Player settings" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Home" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Player settings" })).toBeNull();
  });

  it("the Settings button and o toggle it, and it replaces another open sheet", async () => {
    await setup();
    await act(async () => {
      fireEvent.keyDown(window, { key: "i" });
    });
    expect(screen.getByRole("region", { name: "Player information" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("region", { name: "Player information" })).toBeNull();
    expect(screen.getByRole("region", { name: "Player settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("region", { name: "Player settings" })).toBeNull();
  });

  it("changes to auto-play, Countdown, Intros, Credits, and Continue watching make no gateway call and no relaunch", async () => {
    const { gateway, engine } = await setup();
    const { sheet, user } = await openSettings();
    const before = callCounts(gateway, engine);

    await openSection(sheet, "Playback", user);
    await user.click(within(sheet).getByRole("switch", { name: "Play next episode automatically" }));
    expect(await screen.findByText("Next episodes won't play automatically.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /^Countdown before/ }));
    await user.click(screen.getByRole("option", { name: "15 seconds" }));
    expect(await screen.findByText("Countdown set to 15 seconds.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /^What happens at an intro/ }));
    await user.click(screen.getByRole("option", { name: "Skip automatically" }));
    expect(await screen.findByText("Intros: Skip automatically.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /^What happens at the credits/ }));
    await user.click(screen.getByRole("option", { name: "Do nothing" }));
    expect(await screen.findByText("Credits: Do nothing.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await openSection(sheet, "Home", user);
    await user.click(within(sheet).getAllByRole("button", { name: /Continue watching/ })[0]);
    await user.click(screen.getAllByRole("option")[0]);

    expect(callCounts(gateway, engine)).toEqual(before);
    expect(screen.queryByText("Loading…")).toBeNull();
    // The confirmations are OSD lines, never toasts.
    expect(document.querySelector(".ui-toast, [data-toast]")).toBeNull();
  });

  it("shows only the staged Playback rows: no streaming limits and no limits intro", async () => {
    await setup();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Playback", user);
    expect(within(sheet).queryByText("Local network")).toBeNull();
    expect(within(sheet).queryByText("Remote")).toBeNull();
    expect(within(sheet).queryByText(/apply the next time you press Play/)).toBeNull();
    expect(within(sheet).getByText("Audio passthrough")).toBeInTheDocument();
  });

  it("turning auto-play off while the card counts stops the countdown and the end of the file opens the series page", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const gateway = gatewayFor();
    const engine = new FakePlayerEngine();
    const store = new MemoryPreferenceStore();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <SessionProvider createGateway={() => gateway}>
            <PlayerServicesProvider services={{ engine }}>
              <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits(), continueWindow: continueWindowOf(store), skipModes: skipModesOf(store), autoPlay: autoPlayOf(store) }}>
                <SignIn gateway={gateway} />
                <Routes />
              </PreferencesProvider>
            </PlayerServicesProvider>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      engine.emit({ kind: "loaded", snapshot: snapshotAt(1180) });
      engine.emit({ kind: "first-frame" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("complementary", { name: "Up next" })).toHaveTextContent("Playing in 10 seconds");

    await act(async () => {
      fireEvent.keyDown(window, { key: "o" });
      await vi.advanceTimersByTimeAsync(0);
    });
    const sheet = screen.getByRole("region", { name: "Player settings" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Playback" }));
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("switch", { name: "Play next episode automatically" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const card = screen.getByRole("complementary", { name: "Up next" });
    expect(card).not.toHaveTextContent("Playing in");
    expect(within(card).getByRole("button", { name: "Hide" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(window.location.hash).toBe("#/next/play/e1");
    await act(async () => {
      engine.emit({ kind: "ended", reason: "eof", snapshot: snapshotAt(1200) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(window.location.hash).toBe("#/next/series/s1");
  });

  it("Intros set to Do nothing hides Skip intro, and Skip automatically seeks past the intro with an OSD line", async () => {
    const { engine } = await setup();
    await atPosition(engine, 70);
    expect(await screen.findByRole("button", { name: "Skip intro" })).toBeInTheDocument();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Playback", user);
    await user.click(within(sheet).getByRole("button", { name: /^What happens at an intro/ }));
    await user.click(screen.getByRole("option", { name: "Do nothing" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Skip intro" })).toBeNull());
    await user.click(within(sheet).getByRole("button", { name: /^What happens at an intro/ }));
    await user.click(screen.getByRole("option", { name: "Skip automatically" }));
    await waitFor(() => expect(engine.seek).toHaveBeenCalledWith(90));
    expect(await screen.findByText("Skipped intro")).toBeInTheDocument();
  });

  it("Credits set to Do nothing hides Skip credits on a movie", async () => {
    const gateway = gatewayFor({ mediaSegments: vi.fn().mockResolvedValue([{ kind: "Outro", startSeconds: 1000, endSeconds: 1200 }]), nextEpisode: vi.fn().mockResolvedValue(undefined) });
    const { engine } = await setup(gateway);
    await atPosition(engine, 1010);
    expect(await screen.findByRole("button", { name: "Skip credits" })).toBeInTheDocument();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Playback", user);
    await user.click(within(sheet).getByRole("button", { name: /^What happens at the credits/ }));
    await user.click(screen.getByRole("option", { name: "Do nothing" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Skip credits" })).toBeNull());
  });

  it("copies the redacted report on the OSD without a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await setup();
    const { sheet, user } = await openSettings();
    // After userEvent.setup(), which installs its own clipboard.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await openSection(sheet, "About & diagnostics", user);
    await within(sheet).findByText("10.11.7");
    await user.click(within(sheet).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0]).split("\n")).toHaveLength(7);
    for (const marker of ["media.test", "Tester", "Hearth"]) expect(String(writeText.mock.calls[0][0])).not.toContain(marker);
    expect(await screen.findByText("Diagnostics copied")).toBeInTheDocument();
    expect(document.querySelector(".ui-toast")).toBeNull();
  });

  it("typing o in an open Countdown list leaves the sheet open", async () => {
    await setup();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Playback", user);
    await user.click(within(sheet).getByRole("button", { name: /^Countdown before/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("o");
    expect(screen.getByRole("region", { name: "Player settings" })).toBeInTheDocument();
  });

  it("a change in the sheet is stored in the shared preference store", async () => {
    const { store } = await setup();
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Playback", user);
    await user.click(within(sheet).getByRole("switch", { name: "Play next episode automatically" }));
    expect(store.get().autoPlay.enabled).toBe(false);
  });
});

describe("Sign out from the Settings sheet", () => {
  async function openSignOut() {
    const { sheet, user } = await openSettings();
    await openSection(sheet, "Account", user);
    await user.click(await within(sheet).findByRole("button", { name: "Sign out" }));
    return { sheet, user };
  }

  it("asks first, and Cancel returns focus to the Sign out row with playback untouched", async () => {
    const { gateway, engine } = await setup();
    const { sheet, user } = await openSignOut();
    const dialog = await screen.findByRole("alertdialog", { name: "Stop playback and sign out?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toHaveFocus();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(gateway.logout).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/next/play/e1");
  });

  it("Escape closes the confirm and leaves the sheet open", async () => {
    const { engine } = await setup();
    const { user } = await openSignOut();
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Player settings" })).toBeInTheDocument();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("confirming stops playback, shows the sign-in screen at once, and revokes only after the Stopped report", async () => {
    let releaseReport: () => void = () => undefined;
    const gateway = gatewayFor({ reportStopped: vi.fn(() => new Promise<void>((resolve) => { releaseReport = resolve; })) });
    const { engine } = await setup(gateway);
    const { user } = await openSignOut();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.hash).toBe(SIGN_IN_ROUTE));
    await waitFor(() => expect(screen.getByText("signed out")).toBeInTheDocument());
    expect(gateway.logout).not.toHaveBeenCalled();
    await act(async () => releaseReport());
    await waitFor(() => expect(gateway.logout).toHaveBeenCalledTimes(1));
    expect(vi.mocked(gateway.reportStopped).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(gateway.logout).mock.invocationCallOrder[0]);
  });

  it("a failed stop keeps the viewer signed in and in the player with the error notice", async () => {
    const { gateway, engine } = await setup();
    engine.stop.mockRejectedValueOnce(new Error("mpv stuck"));
    const { user } = await openSignOut();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(engine.stop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(window.location.hash).toBe("#/next/play/e1");
    expect(screen.queryByText("signed out")).toBeNull();
    expect(gateway.logout).not.toHaveBeenCalled();
  });
});
