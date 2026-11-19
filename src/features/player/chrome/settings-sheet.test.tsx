import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SAVED_MS } from "./timing";
import { PlayerServicesProvider } from "../../../app/player-services";
import { PreferencesProvider } from "../../../app/preferences";
import { SessionProvider } from "../../../app/session";
import { autoPlayOf, continueWindowOf, MemoryPreferenceStore, skipModesOf } from "../../../lib/preference-store";
import { MemoryStreamingLimits } from "../../../lib/streaming-limits";
import { FakePlayerEngine } from "../../../test/fake-player-engine";
import { fakeSessionGateway } from "../../../test/fake-session-gateway";
import { SettingsSheet } from "./settings-sheet";

afterEach(cleanup);

function renderSheet(props: Partial<Parameters<typeof SettingsSheet>[0]> = {}) {
  const store = new MemoryPreferenceStore();
  const handlers = { onClose: vi.fn(), onSignOut: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider createGateway={() => fakeSessionGateway()}>
        <PlayerServicesProvider services={{ engine: new FakePlayerEngine() }}>
          <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits(), continueWindow: continueWindowOf(store), skipModes: skipModesOf(store), autoPlay: autoPlayOf(store) }}>
            <SettingsSheet {...handlers} {...props} />
          </PreferencesProvider>
        </PlayerServicesProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return handlers;
}

it("opens on the section list with the five sections and focus on the first", () => {
  renderSheet();
  const nav = screen.getByRole("navigation", { name: "Settings sections" });
  expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(["Playback", "Home", "Subtitles", "Account", "About & diagnostics"]);
  expect(within(nav).getByRole("button", { name: "Playback" })).toHaveFocus();
});

it("Enter opens a section with focus on its heading, and Escape returns to the list with focus on that section", async () => {
  const user = userEvent.setup();
  renderSheet();
  screen.getByRole("button", { name: "Home" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { level: 2, name: "Home" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Home" })).toHaveFocus();
});

it("closes with the Close button", async () => {
  const user = userEvent.setup();
  const { onClose } = renderSheet();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("has no All settings row and no Languages section", () => {
  renderSheet();
  expect(screen.queryByRole("button", { name: /All settings/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Languages" })).toBeNull();
});

it("matches the --saved-ms token", () => {
  const tokens = readFileSync(join(__dirname, "../../../styles/tokens.css"), "utf8");
  expect(tokens).toContain(`--saved-ms: ${SAVED_MS};`);
});

it("shows Saved beside the changed row, announces it politely, and clears it after the Saved time", () => {
  vi.useFakeTimers();
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Playback" }));
  fireEvent.click(screen.getByRole("switch", { name: "Play next episode automatically" }));
  const row = screen.getByRole("switch", { name: "Play next episode automatically" }).closest(".settings-row") as HTMLElement;
  const status = within(row).getByRole("status");
  expect(status).toHaveTextContent("Saved");
  // Only the changed row says it, and the Settings toast words are not shown.
  expect(screen.getAllByText(/Saved/)).toHaveLength(1);
  expect(screen.queryByText(/Next episodes/)).toBeNull();
  try {
    act(() => { vi.advanceTimersByTime(SAVED_MS - 1); });
    expect(status).toHaveTextContent("Saved");
    act(() => { vi.advanceTimersByTime(1); });
    expect(status).toBeEmptyDOMElement();
  } finally {
    vi.useRealTimers();
  }
});
