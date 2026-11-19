import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PlayerServicesProvider } from "../../app/player-services";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { autoPlayOf, continueWindowOf, MemoryPreferenceStore, skipModesOf } from "../../lib/preference-store";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { FakePlayerEngine } from "../../test/fake-player-engine";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { SettingsSheet } from "../player/chrome/settings-sheet";
import { ToastProvider } from "../shared/ui";
import { SETTINGS_SECTIONS, STAGED_FOR_LATER } from "./settings-sections";
import { SettingsView } from "./settings-view";

afterEach(cleanup);

const STAGED_ROWS = ["Local network", "Remote"];

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function mount(place: "page" | "sheet", preferenceStore: MemoryPreferenceStore) {
  const gateway = fakeSessionGateway({ connect: vi.fn().mockResolvedValue({ name: "Hearth", id: "s1", version: "10.11.7", hostClass: "public", needsUnencryptedConfirmation: false }) });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <SessionProvider createGateway={() => gateway}>
          <PlayerServicesProvider services={{ engine: new FakePlayerEngine() }}>
            <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits(), continueWindow: continueWindowOf(preferenceStore), skipModes: skipModesOf(preferenceStore), autoPlay: autoPlayOf(preferenceStore) }}>
              <SignIn gateway={gateway} />
              {place === "page" ? <SettingsView /> : <SettingsSheet onClose={() => undefined} onSignOut={() => undefined} />}
            </PreferencesProvider>
          </PlayerServicesProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

interface RowFacts {
  label: string;
  description: string;
  disabled: boolean;
  value: string;
  control: string;
  options: string[];
}

async function openSection(place: "page" | "sheet", label: string) {
  const user = userEvent.setup();
  if (place === "page") await user.click(screen.getByRole("tab", { name: label }));
  else await user.click(within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", { name: label }));
  await screen.findByRole("heading", { level: 2, name: label });
  return user;
}

async function rowsOf(user: ReturnType<typeof userEvent.setup>): Promise<RowFacts[]> {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".settings-row"));
  const facts: RowFacts[] = [];
  for (const row of rows) {
    const control = row.querySelector<HTMLElement>("button, [role=switch]");
    let options: string[] = [];
    let controlFacts = "none";
    if (control) {
      const picker = control.getAttribute("aria-haspopup") === "listbox";
      controlFacts = `${picker ? "picker" : (control.getAttribute("role") ?? "button")}|${control.getAttribute("aria-label") ?? ""}|${control.textContent}|${control.getAttribute("aria-checked") ?? ""}`;
      if (picker) {
        await user.click(control);
        options = screen.getAllByRole("option").map((option) => option.textContent ?? "");
        await user.keyboard("{Escape}");
      }
    }
    facts.push({
      label: row.querySelector(".settings-row-label")?.textContent ?? "",
      description: row.querySelector(".settings-row-description")?.textContent ?? "",
      disabled: row.getAttribute("aria-disabled") === "true",
      value: row.querySelector(".settings-row-value")?.textContent ?? "",
      control: controlFacts,
      options,
    });
  }
  return facts;
}

async function factsFor(place: "page" | "sheet", store: MemoryPreferenceStore) {
  const all: Record<string, RowFacts[]> = {};
  for (const section of SETTINGS_SECTIONS) {
    if (place === "sheet" && STAGED_FOR_LATER.sections.includes(section.id)) continue;
    cleanup();
    await mount(place, store);
    const user = await openSection(place, section.label);
    // The server's answer fills Account and About; wait for it.
    if (section.id === "account" || section.id === "about") await screen.findAllByText(section.id === "about" ? "10.11.7" : "Hearth");
    all[section.id] = await rowsOf(user);
  }
  return all;
}

it("lists the sheet's sections as the page's minus the staged ones, in the same order", async () => {
  await mount("sheet", new MemoryPreferenceStore());
  const nav = screen.getByRole("navigation", { name: "Settings sections" });
  expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual(
    SETTINGS_SECTIONS.filter((section) => !STAGED_FOR_LATER.sections.includes(section.id)).map((section) => section.label),
  );
});

it("renders every shared row the same on the page and in the sheet", async () => {
  const store = new MemoryPreferenceStore();
  const page = await factsFor("page", store);
  const sheet = await factsFor("sheet", store);
  expect(Object.keys(sheet)).toEqual(Object.keys(page).filter((id) => !STAGED_FOR_LATER.sections.includes(id)));
  for (const id of Object.keys(sheet)) {
    const pageRows = page[id].filter((row) => !(STAGED_FOR_LATER.playbackLimitRows && id === "playback" && STAGED_ROWS.includes(row.label)));
    expect(sheet[id], id).toEqual(pageRows);
    expect(sheet[id].length, id).toBeGreaterThan(0);
  }
  // The staged rows really are left out of the sheet, and present on the page.
  expect(page.playback.map((row) => row.label)).toEqual(expect.arrayContaining(STAGED_ROWS));
  expect(sheet.playback.map((row) => row.label)).not.toEqual(expect.arrayContaining(STAGED_ROWS));
});

it("a change in the sheet shows on the page, and one on the page shows in the sheet, through the one store", async () => {
  const store = new MemoryPreferenceStore();
  await mount("sheet", store);
  let user = await openSection("sheet", "Playback");
  await user.click(screen.getByRole("switch", { name: "Play next episode automatically" }));
  expect(store.get().autoPlay.enabled).toBe(false);

  cleanup();
  await mount("page", store);
  user = await openSection("page", "Playback");
  const onPage = screen.getByRole("switch", { name: "Play next episode automatically" });
  expect(onPage).toHaveAttribute("aria-checked", "false");
  await user.click(onPage);
  expect(store.get().autoPlay.enabled).toBe(true);

  cleanup();
  await mount("sheet", store);
  await openSection("sheet", "Playback");
  expect(screen.getByRole("switch", { name: "Play next episode automatically" })).toHaveAttribute("aria-checked", "true");
});
