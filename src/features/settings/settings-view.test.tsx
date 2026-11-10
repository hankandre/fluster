import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreferencesProvider } from "../../app/preferences";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { MemoryStreamingLimits } from "../../lib/streaming-limits";
import { SettingsView } from "./settings-view";

afterEach(cleanup);

function renderSettings(store = new MemoryStreamingLimits()) {
  render(
    <SessionProvider createGateway={() => fakeSessionGateway()}>
      <PreferencesProvider preferences={{ streamingLimits: store }}>
        <SettingsView />
      </PreferencesProvider>
    </SessionProvider>,
  );
  return store;
}

it("shows No limit for both limits by default", () => {
  renderSettings();
  expect(screen.getByLabelText("Local network maximum bitrate")).toHaveValue("none");
  expect(screen.getByLabelText("Remote maximum bitrate")).toHaveValue("none");
});

it("saves each limit on its own and can return to No limit", () => {
  const store = renderSettings();
  fireEvent.change(screen.getByLabelText("Remote maximum bitrate"), { target: { value: "10" } });
  expect(store.get()).toEqual({ remoteMbps: 10 });
  fireEvent.change(screen.getByLabelText("Local network maximum bitrate"), { target: { value: "80" } });
  expect(store.get()).toEqual({ localMbps: 80, remoteMbps: 10 });
  fireEvent.change(screen.getByLabelText("Remote maximum bitrate"), { target: { value: "none" } });
  expect(store.get()).toEqual({ localMbps: 80 });
});

it("starts from the stored values", () => {
  renderSettings(new MemoryStreamingLimits({ localMbps: 4 }));
  expect(screen.getByLabelText("Local network maximum bitrate")).toHaveValue("4");
});

it("offers No limit first, then the Mbps choices, as keyboard-reachable selects", () => {
  renderSettings();
  const options = Array.from(screen.getByLabelText("Remote maximum bitrate").querySelectorAll("option")).map((o) => o.textContent);
  expect(options).toEqual(["No limit", "120 Mbps", "80 Mbps", "40 Mbps", "20 Mbps", "10 Mbps", "8 Mbps", "4 Mbps", "2 Mbps"]);
  expect(screen.getByRole("combobox", { name: /Local network/ })).toBeInTheDocument();
});

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

it("signs out from Settings: revokes the server session and returns to sign-in", async () => {
  const gateway = fakeSessionGateway({ logout: vi.fn().mockResolvedValue(undefined) });
  render(
    <SessionProvider createGateway={() => gateway}>
      <PreferencesProvider preferences={{ streamingLimits: new MemoryStreamingLimits() }}>
        <SignIn gateway={gateway} />
        <SettingsView />
      </PreferencesProvider>
    </SessionProvider>,
  );
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  });
  expect(gateway.logout).toHaveBeenCalledTimes(1);
  expect(window.location.hash).toBe("#/next/sign-in");
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
});
