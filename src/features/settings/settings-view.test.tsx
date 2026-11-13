import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { PlayerCapabilities } from "../../domain/playback";
import type { ServerConnection } from "../../domain/server-connection";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { recordDecode, resetLastDecode } from "../player/last-decode";
import { ToastProvider } from "../shared/ui";
import { diagnosticsText } from "./diagnostics";
import { SettingsView } from "./settings-view";

afterEach(() => {
  cleanup();
  resetLastDecode();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

beforeEach(() => {
  window.location.hash = "";
});

const SERVER: ServerConnection = { name: "Hearth", id: "server-1", version: "10.11.7", hostClass: "public", needsUnencryptedConfirmation: false };

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

interface Options {
  store?: MemoryStreamingLimits;
  gateway?: SessionGateway;
  engine?: FakePlayerEngine;
  signedIn?: boolean;
}

async function renderSettings({ store = new MemoryStreamingLimits(), gateway, engine, signedIn = false }: Options = {}) {
  const sessionGateway = gateway ?? fakeSessionGateway({ connect: vi.fn().mockResolvedValue(SERVER) });
  let tree: ReactNode = (
    <>
      <SignIn gateway={sessionGateway} />
      <SettingsView />
    </>
  );
  if (engine) tree = <PlayerServicesProvider services={{ engine }}>{tree}</PlayerServicesProvider>;
  const result = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <SessionProvider createGateway={() => sessionGateway}>
          <PreferencesProvider preferences={{ streamingLimits: store }}>{tree}</PreferencesProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  if (signedIn) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
    });
  }
  return { store, gateway: sessionGateway, ...result };
}

const tab = (name: string) => screen.getByRole("tab", { name });
const local = () => screen.getByRole("button", { name: /^Local network maximum bitrate/ });
const remote = () => screen.getByRole("button", { name: /^Remote maximum bitrate/ });

async function choose(trigger: HTMLElement, option: string) {
  const user = userEvent.setup();
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: option }));
}

const nativeCaps: PlayerCapabilities = { mode: "native", embedded: true, renderer: "libmpv", nativeRenderer: "gl", libmpvVersion: "mpv 0.41.0" };

function engineWith(caps: PlayerCapabilities | Error) {
  const engine = new FakePlayerEngine();
  engine.initialize.mockImplementation(() => (caps instanceof Error ? Promise.reject(caps) : Promise.resolve(caps)));
  return engine;
}

// Sections

it("lists the four sections in order and shows each one's heading", async () => {
  await renderSettings();
  const list = screen.getByRole("tablist", { name: "Settings sections" });
  expect(within(list).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Playback", "Subtitles", "Account", "About & diagnostics"]);
  expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
  expect(tab("Playback")).toHaveAttribute("aria-selected", "true");
  for (const name of ["Playback", "Subtitles", "Account", "About & diagnostics"]) {
    fireEvent.click(tab(name));
    expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  }
});

it("renders no native select", async () => {
  const { container } = await renderSettings();
  expect(container.querySelector("select")).toBeNull();
});

// Playback

it("shows No limit for both limits by default, on keyboard-reachable Picker triggers", async () => {
  await renderSettings();
  expect(local()).toHaveTextContent("No limit");
  expect(remote()).toHaveTextContent("No limit");
  expect(local()).toHaveAttribute("aria-haspopup", "listbox");
  expect(remote()).toHaveAttribute("aria-haspopup", "listbox");
});

it("saves each limit on its own and can return to No limit", async () => {
  const { store } = await renderSettings();
  await choose(remote(), "10 Mbps");
  expect(store.get()).toEqual({ remoteMbps: 10 });
  await choose(local(), "80 Mbps");
  expect(store.get()).toEqual({ localMbps: 80, remoteMbps: 10 });
  await choose(remote(), "No limit");
  expect(store.get()).toEqual({ localMbps: 80 });
});

it("starts from the stored values", async () => {
  await renderSettings({ store: new MemoryStreamingLimits({ localMbps: 4 }) });
  expect(local()).toHaveTextContent("4 Mbps");
});

it("offers No limit first, then the Mbps choices", async () => {
  await renderSettings();
  await userEvent.setup().click(remote());
  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["No limit", "120 Mbps", "80 Mbps", "40 Mbps", "20 Mbps", "10 Mbps", "8 Mbps", "4 Mbps", "2 Mbps"]);
});

it("confirms each change with a toast, and says nothing when the value is the same", async () => {
  const { store } = await renderSettings();
  const set = vi.spyOn(store, "set");
  await choose(remote(), "10 Mbps");
  expect(await screen.findByText("Remote limit set to 10 Mbps.")).toBeInTheDocument();
  await choose(local(), "80 Mbps");
  expect(await screen.findByText("Local network limit set to 80 Mbps.")).toBeInTheDocument();
  await choose(remote(), "No limit");
  expect(await screen.findByText("Remote limit removed.")).toBeInTheDocument();
  expect(set).toHaveBeenCalledTimes(3);
  await choose(local(), "80 Mbps");
  expect(set).toHaveBeenCalledTimes(3);
  expect(screen.getAllByText(/limit/).filter((node) => node.closest(".ui-toast"))).toHaveLength(3);
});

// Unavailable rows and Subtitles

it("shows Audio passthrough disabled in Playback", async () => {
  const { container } = await renderSettings();
  const row = container.querySelector<HTMLElement>('[data-unbuilt="P5-03"]')!;
  expect(screen.getByRole("tabpanel")).toContainElement(row);
  expect(row).toHaveTextContent("Audio passthrough");
  expect(row).toHaveTextContent("Not available yet.");
  expect(row).toHaveAttribute("aria-disabled", "true");
});

it("shows one sentence in Subtitles with no link, no focusable element, and no server call", async () => {
  const { gateway } = await renderSettings({ signedIn: true });
  const calls = () => Object.values(gateway).filter((value) => vi.isMockFunction(value)).map((value) => (value as ReturnType<typeof vi.fn>).mock.calls.length);
  const before = calls();
  fireEvent.click(tab("Subtitles"));
  const panel = screen.getByRole("tabpanel");
  expect(panel).toHaveTextContent(/^SubtitlesSubtitle languages follow your Jellyfin account; change them in Jellyfin\.$/);
  expect(panel.querySelector("a, button, input, [tabindex]:not([tabindex='-1'])")).toBeNull();
  expect(calls()).toEqual(before);
  expect(gateway.connect).not.toHaveBeenCalled();
});

// Account

it("shows the server name, the address in Mono, the user, Stay signed in unavailable, and Sign out", async () => {
  const { container } = await renderSettings({ signedIn: true });
  fireEvent.click(tab("Account"));
  expect(await screen.findByText("Hearth")).toBeInTheDocument();
  expect(screen.getByText("https://media.test")).toHaveClass("settings-mono");
  expect(screen.getByText("Tester")).toBeInTheDocument();
  expect(container.querySelector('[data-unbuilt="P3-02"]')).toHaveTextContent("Stay signed in");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

it("shows a placeholder while the server answers, then the name", async () => {
  let resolve: (value: ServerConnection) => void = () => undefined;
  const connect = vi.fn(() => new Promise<ServerConnection>((r) => { resolve = r; }));
  const { container } = await renderSettings({ gateway: fakeSessionGateway({ connect }), signedIn: true });
  fireEvent.click(tab("Account"));
  expect(container.querySelector(".ui-skeleton")).not.toBeNull();
  await act(async () => resolve(SERVER));
  expect(await screen.findByText("Hearth")).toBeInTheDocument();
  expect(container.querySelector(".ui-skeleton")).toBeNull();
});

it("shows no error text when the server cannot be read", async () => {
  const connect = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.9"));
  const { container } = await renderSettings({ gateway: fakeSessionGateway({ connect }), signedIn: true });
  fireEvent.click(tab("Account"));
  await waitFor(() => expect(connect).toHaveBeenCalled());
  await waitFor(() => expect(container.querySelector(".ui-skeleton")).toBeNull());
  expect(screen.queryByText(/ECONNREFUSED|10\.0\.0\.9/)).toBeNull();
  expect(screen.getByText("https://media.test")).toBeInTheDocument();
});

it("signs out from Settings: revokes the server session, returns to sign-in, and says so", async () => {
  const gateway = fakeSessionGateway({ connect: vi.fn().mockResolvedValue(SERVER), logout: vi.fn().mockResolvedValue(undefined) });
  await renderSettings({ gateway });
  fireEvent.click(tab("Account"));
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  });
  expect(gateway.logout).toHaveBeenCalledTimes(1);
  expect(window.location.hash).toBe("#/next/sign-in");
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  expect(await screen.findByText("Signed out")).toBeInTheDocument();
});

// About

it("shows the version, the native player with libmpv's own version, the renderer, and the server version", async () => {
  await renderSettings({ signedIn: true, engine: engineWith(nativeCaps) });
  fireEvent.click(tab("About & diagnostics"));
  expect(screen.getByText("Fluster 0.1.0")).toBeInTheDocument();
  expect(await screen.findByText("Native, libmpv 0.41.0")).toBeInTheDocument();
  expect(screen.getByText("gl")).toBeInTheDocument();
  expect(await screen.findByText("10.11.7")).toBeInTheDocument();
});

it("says Browser (development) for the browser engine", async () => {
  await renderSettings({ signedIn: true, engine: new FakePlayerEngine() });
  fireEvent.click(tab("About & diagnostics"));
  expect(await screen.findByText("Browser (development)")).toBeInTheDocument();
});

it("says Checking while the player starts, and Not available when it cannot", async () => {
  let reject: (reason: Error) => void = () => undefined;
  const engine = new FakePlayerEngine();
  engine.initialize.mockImplementation(() => new Promise<PlayerCapabilities>((_, r) => { reject = r; }));
  await renderSettings({ signedIn: true, engine });
  fireEvent.click(tab("About & diagnostics"));
  expect(screen.getByText("Checking…")).toBeInTheDocument();
  await act(async () => reject(new Error("libmpv missing")));
  expect(await screen.findByText("Not available")).toBeInTheDocument();
  expect(screen.queryByText(/libmpv missing/)).toBeNull();
});

it("copies the redacted report and confirms with a toast", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  recordDecode({ decodeMode: "hardware", decodeLabel: "Hardware", hwdecCurrent: "vaapi", droppedFrames: 0 });
  await renderSettings({ signedIn: true, engine: engineWith(nativeCaps) });
  fireEvent.click(tab("About & diagnostics"));
  await screen.findByText("Native, libmpv 0.41.0");
  await screen.findByText("10.11.7");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  const expected = diagnosticsText({
    appVersion: "0.1.0",
    os: "Unknown",
    player: { kind: "native", libmpvVersion: "mpv 0.41.0", renderer: "gl" },
    decode: { mode: "hardware", hwdec: "vaapi" },
    serverVersion: "10.11.7",
    hostClass: "public",
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0][0].replace(/^OS: .*$/m, "OS: Unknown")).toBe(expected);
  expect(writeText.mock.calls[0][0].split("\n")).toHaveLength(7);
  expect(await screen.findByText("Diagnostics copied")).toBeInTheDocument();
});

it("leaves the server name, address, and user out of the copied text", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const gateway = fakeSessionGateway({
    serverUrl: "https://marker-host.test",
    origin: "https://marker-host.test",
    connect: vi.fn().mockResolvedValue({ ...SERVER, name: "MARKER-NAME" }),
    currentUserName: vi.fn(() => "MARKER-USER"),
  });
  await renderSettings({ gateway, signedIn: true, engine: engineWith(nativeCaps) });
  fireEvent.click(tab("About & diagnostics"));
  await screen.findByText("10.11.7");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  const copied = String(writeText.mock.calls[0][0]);
  for (const marker of ["marker-host", "MARKER-NAME", "MARKER-USER", "media.test"]) expect(copied).not.toContain(marker);
});

it("shows the report in a focused, selectable block when the clipboard refuses", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  await renderSettings({ signedIn: true, engine: engineWith(nativeCaps) });
  fireEvent.click(tab("About & diagnostics"));
  await screen.findByText("10.11.7");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't copy. Select the text below and copy it.");
  const block = screen.getByLabelText("Diagnostics");
  expect(block.tagName).toBe("PRE");
  expect(block).toHaveFocus();
  expect(block.textContent?.split("\n")).toHaveLength(7);
  expect(screen.queryByText("Diagnostics copied")).toBeNull();
});

it("shows the same block when the browser has no clipboard", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  await renderSettings({ signedIn: true, engine: engineWith(nativeCaps) });
  fireEvent.click(tab("About & diagnostics"));
  await screen.findByText("10.11.7");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(screen.getByLabelText("Diagnostics")).toBeInTheDocument();
});
