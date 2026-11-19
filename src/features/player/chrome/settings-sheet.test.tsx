import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
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
  const handlers = { onClose: vi.fn(), confirm: vi.fn(), onSignOut: vi.fn() };
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
