import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { AccountLanguageSettings } from "../../domain/account-language-choices";
import type { ServerConnection } from "../../domain/server-connection";
import { toLanguageCultures } from "../../lib/jellyfin/account-languages";
import { continueWindowOf, MemoryPreferenceStore } from "../../lib/preference-store";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { accountLanguageSettingsKey, accountLanguagesKey } from "../shared/account-languages";
import { ToastProvider } from "../shared/ui";
import { LanguagesSection } from "./languages-section";

afterEach(() => {
  cleanup();
});

const SERVER: ServerConnection = { name: "Hearth", id: "server-1", version: "10.11.7", hostClass: "public", needsUnencryptedConfirmation: false };
const root = join(__dirname, "../../../tests/fixtures/jellyfin");
const cultures = (version: string) => toLanguageCultures(JSON.parse(readFileSync(join(root, version, "account-language-cultures.json"), "utf8")));

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

interface Options {
  settings?: AccountLanguageSettings | Error;
  save?: ReturnType<typeof vi.fn>;
  version?: string;
}

async function renderLanguages({ settings = { playDefaultAudioTrack: true, subtitleMode: "Default" }, save, version = "10.11.7" }: Options = {}) {
  const gateway = fakeSessionGateway({
    connect: vi.fn().mockResolvedValue(SERVER),
    accountLanguageSettings: vi.fn(() => (settings instanceof Error ? Promise.reject(settings) : Promise.resolve(settings))),
    languageCultures: vi.fn().mockResolvedValue(cultures(version)),
    ...(save ? { saveAccountLanguages: save as unknown as SessionGateway["saveAccountLanguages"] } : {}),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const preferenceStore = new MemoryPreferenceStore();
  const limits = new MemoryStreamingLimits();
  const limitsSet = vi.spyOn(limits, "set");
  const prefSet = vi.spyOn(preferenceStore, "update");
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider createGateway={() => gateway}>
          <PreferencesProvider preferences={{ streamingLimits: limits, continueWindow: continueWindowOf(preferenceStore) }}>
            <SignIn gateway={gateway} />
            <LanguagesSection />
          </PreferencesProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
  return { gateway, queryClient, limitsSet, prefSet };
}

const audio = () => screen.getByRole("button", { name: /^Audio language/ });
const subtitles = () => screen.getByRole("button", { name: /^Subtitle language/ });

async function ready() {
  await waitFor(() => expect(audio()).toBeEnabled());
}

async function choose(trigger: HTMLElement, option: string) {
  const user = userEvent.setup();
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: option }));
}

it("shows the account's saved values and says they belong to the account", async () => {
  await renderLanguages();
  await ready();
  expect(screen.getByText(/Saved to your Jellyfin account, so your other Jellyfin apps use them too\. Every other setting stays on this computer\./)).toBeInTheDocument();
  expect(audio()).toHaveTextContent("The file's default");
  expect(subtitles()).toHaveTextContent("The file's default");
});

it("shows a language and a subtitle mode from the read", async () => {
  await renderLanguages({ settings: { playDefaultAudioTrack: false, audioLanguage: "ger", subtitleMode: "Always", subtitleLanguage: "fra" } });
  await ready();
  expect(audio()).toHaveTextContent("German");
  expect(subtitles()).toHaveTextContent("French, always");
});

it("lists the fixed choices first, then every language", async () => {
  await renderLanguages();
  await ready();
  const user = userEvent.setup();
  await user.click(audio());
  const options = screen.getAllByRole("option");
  expect(options.slice(0, 2).map((option) => option.textContent)).toEqual(["The file's default", "Original language"]);
  expect(options).toHaveLength(2 + 187);
  expect(screen.getByRole("option", { name: "The file's default" })).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Escape}");
  await user.click(subtitles());
  const subs = screen.getAllByRole("option").map((option) => option.textContent);
  expect(subs.slice(0, 2)).toEqual(["Off", "The file's default"]);
  expect(subs).toHaveLength(2 + 2 * 187);
  const french = subs.indexOf("French, when the audio is in another language");
  expect(subs[french + 1]).toBe("French, always");
});

it("saves an audio language, says Play default audio track is off, and keeps the computer's stores untouched", async () => {
  const save = vi.fn().mockResolvedValue({ playDefaultAudioTrack: false, audioLanguage: "fra", subtitleMode: "Default" });
  const { limitsSet, prefSet, queryClient, gateway } = await renderLanguages({ save });
  await ready();
  await choose(audio(), "French");
  expect(save).toHaveBeenCalledWith({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false });
  await waitFor(() => expect(screen.getByText("Audio set to French.")).toBeInTheDocument());
  expect(audio()).toHaveTextContent("French");
  expect(screen.getByText(/Play default audio track is off/)).toBeInTheDocument();
  expect(limitsSet).not.toHaveBeenCalled();
  expect(prefSet).not.toHaveBeenCalled();
  const cached = queryClient.getQueryData<Record<string, unknown>>(accountLanguageSettingsKey(gateway));
  expect(Object.keys(cached ?? {}).sort()).toEqual(["audioLanguage", "playDefaultAudioTrack", "subtitleMode"]);
});

it("sends nothing when the shown value is chosen again", async () => {
  const save = vi.fn();
  await renderLanguages({ save });
  await ready();
  await choose(audio(), "The file's default");
  expect(save).not.toHaveBeenCalled();
});

it("updates the detail list's subtitle language after a save", async () => {
  const save = vi.fn().mockResolvedValue({ playDefaultAudioTrack: true, subtitleMode: "Always", subtitleLanguage: "fra" });
  const { queryClient, gateway } = await renderLanguages({ save });
  await ready();
  await choose(subtitles(), "French, always");
  expect(save).toHaveBeenCalledWith({ SubtitleLanguagePreference: "fra", SubtitleMode: "Always" });
  await waitFor(() => expect(queryClient.getQueryData(accountLanguagesKey(gateway))).toEqual({ subtitleLanguage: "fra" }));
  expect(screen.getByText("Subtitles set to French, always.")).toBeInTheDocument();
});

it("shows what the save returned when another app changed the account meanwhile", async () => {
  const save = vi.fn().mockResolvedValue({ playDefaultAudioTrack: false, audioLanguage: "fra", subtitleMode: "Always", subtitleLanguage: "spa" });
  await renderLanguages({ save });
  await ready();
  await choose(audio(), "French");
  await waitFor(() => expect(subtitles()).toHaveTextContent("Spanish; Castilian, always"));
});

it("puts the old value back after a failed save and shows no transport text", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Network Error http://secret.test?ApiKey=abc"));
  await renderLanguages({ save });
  await ready();
  await choose(audio(), "French");
  await waitFor(() => expect(screen.getByText("Couldn't save your audio language. Try again.")).toBeInTheDocument());
  expect(audio()).toHaveTextContent("The file's default");
  expect(document.body).not.toHaveTextContent("ApiKey");
  expect(document.body).not.toHaveTextContent("secret.test");
});

it("shows both rows as unavailable when the server refuses the save", async () => {
  const save = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { response: { status: 403 } }));
  await renderLanguages({ save });
  await ready();
  await choose(subtitles(), "Off");
  const reason = "Your server didn't accept this change from Fluster. Change it in Jellyfin.";
  await waitFor(() => expect(screen.getAllByText(reason)).toHaveLength(2));
  expect(screen.queryByRole("button", { name: /language/ })).toBeNull();
});

it("shows both rows as unavailable when the read is refused", async () => {
  await renderLanguages({ settings: Object.assign(new Error("x"), { response: { status: 405 } }) });
  await waitFor(() => expect(screen.getAllByText(/didn't accept this change/)).toHaveLength(2));
});

it("drops Original language after the server answers 400 to it", async () => {
  const save = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { response: { status: 400 } }));
  await renderLanguages({ save });
  await ready();
  await choose(audio(), "Original language");
  await waitFor(() => expect(screen.getByText("Couldn't save your audio language. Try again.")).toBeInTheDocument());
  const user = userEvent.setup();
  await user.click(audio());
  expect(screen.queryByRole("option", { name: "Original language" })).toBeNull();
});

it("shows Loading on disabled pickers until the reads finish", async () => {
  await renderLanguages();
  expect(audio()).toBeDisabled();
  expect(audio()).toHaveTextContent("Loading");
  await ready();
});

it("shows a plain error with Retry when the read fails", async () => {
  const { gateway } = await renderLanguages({ settings: new Error("Network Error http://secret.test?ApiKey=abc") });
  await waitFor(() => expect(screen.getByText("Couldn't load your languages.")).toBeInTheDocument());
  expect(document.body).not.toHaveTextContent("ApiKey");
  expect(screen.queryByRole("button", { name: /language/ })).toBeNull();
  vi.mocked(gateway.accountLanguageSettings).mockResolvedValue({ playDefaultAudioTrack: true, subtitleMode: "None" });
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(subtitles()).toHaveTextContent("Off"));
});

it("shows a current-only entry for a read no choice records", async () => {
  await renderLanguages({ settings: { playDefaultAudioTrack: false, subtitleMode: "OnlyForced", subtitleLanguage: "fra" } });
  await ready();
  expect(audio()).toHaveTextContent("Set in another Jellyfin app");
  expect(subtitles()).toHaveTextContent("French, forced subtitles only");
  expect(screen.getAllByText(/Set in another Jellyfin app\. Choose one here to change it\./).length).toBeGreaterThan(0);
});
