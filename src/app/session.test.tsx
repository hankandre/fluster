import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeRealtime } from "../test/fake-realtime";
import { SessionProvider, useSession, type SessionGateway } from "./session";

afterEach(cleanup);

function stubGateway(serverUrl: string, token: string): SessionGateway {
  return {
    serverUrl,
    connect: vi.fn(),
    login: vi.fn(),
    quickConnectEnabled: vi.fn(),
    initiateQuickConnect: vi.fn(),
    pollQuickConnect: vi.fn(),
    authenticateWithQuickConnect: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    userViews: vi.fn(),
    resumeItems: vi.fn(),
    nextUp: vi.fn(),
    latestInLibrary: vi.fn(),
    imageUrl: vi.fn(),
    libraryItems: vi.fn(),
    seasons: vi.fn(),
    episodes: vi.fn(),
    searchHints: vi.fn(),
    searchItems: vi.fn(),
    authorizationHeader: vi.fn().mockReturnValue(`MediaBrowser Token="${token}"`),
  };
}

function Controls({ gateways }: { gateways: SessionGateway[] }) {
  const session = useSession();
  return (
    <>
      {gateways.map((gateway, index) => (
        <button key={index} onClick={() => session.signIn(gateway)}>{`sign in ${index}`}</button>
      ))}
      <button onClick={() => void session.signOut()}>sign out</button>
    </>
  );
}

async function renderSession(gateways: SessionGateway[], onServerDataChanged = vi.fn()) {
  const realtime = new FakeRealtime();
  const view = render(
    <SessionProvider createGateway={() => gateways[0]} realtime={realtime} onServerDataChanged={onServerDataChanged}>
      <Controls gateways={gateways} />
    </SessionProvider>,
  );
  await act(async () => undefined);
  return { realtime, onServerDataChanged, view };
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("SessionProvider server socket", () => {
  it("connects with the gateway's server URL and authorization header after sign-in", async () => {
    const gateway = stubGateway("https://media.test", "token-a");
    const { realtime } = await renderSession([gateway]);
    expect(realtime.connect).not.toHaveBeenCalled();

    await click("sign in 0");

    expect(realtime.calls).toEqual(['connect https://media.test MediaBrowser Token="token-a"']);
  });

  it("disconnects on sign-out", async () => {
    const { realtime } = await renderSession([stubGateway("https://media.test", "token-a")]);
    await click("sign in 0");
    await click("sign out");
    expect(realtime.calls.at(-1)).toBe("disconnect");
    expect(realtime.connect).toHaveBeenCalledTimes(1);
  });

  it("disconnects the old socket before connecting a replacing gateway", async () => {
    const { realtime } = await renderSession([
      stubGateway("https://one.test", "token-a"),
      stubGateway("https://two.test", "token-b"),
    ]);
    await click("sign in 0");
    await click("sign in 1");
    expect(realtime.calls).toEqual([
      'connect https://one.test MediaBrowser Token="token-a"',
      "disconnect",
      'connect https://two.test MediaBrowser Token="token-b"',
    ]);
  });

  it("does not connect when the gateway has no signed-in header", async () => {
    const gateway = stubGateway("https://media.test", "unused");
    vi.mocked(gateway.authorizationHeader).mockImplementation(() => {
      throw new Error("Sign in before using the library.");
    });
    const { realtime } = await renderSession([gateway]);
    await click("sign in 0");
    expect(realtime.connect).not.toHaveBeenCalled();
  });

  it("warns without details when the socket cannot be opened", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { realtime } = await renderSession([stubGateway("https://media.test", "token-a")]);
    realtime.connect.mockRejectedValueOnce(new Error('bad header MediaBrowser Token="token-a"'));
    await click("sign in 0");
    expect(warn).toHaveBeenCalledWith("Live refresh from the server is unavailable.");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("token-a");
    warn.mockRestore();
  });
});

describe("SessionProvider server events", () => {
  it("reports changed watched state from other clients", async () => {
    const { realtime, onServerDataChanged } = await renderSession([stubGateway("https://media.test", "t")]);
    await click("sign in 0");

    act(() => realtime.emit({ kind: "user-data-changed", itemIds: ["aaaa"] }));

    expect(onServerDataChanged).toHaveBeenCalledTimes(1);
  });

  it("refreshes after a reconnect but not on the first connect", async () => {
    const { realtime, onServerDataChanged } = await renderSession([stubGateway("https://media.test", "t")]);
    await click("sign in 0");

    act(() => realtime.emit({ kind: "connection", state: "connected" }));
    expect(onServerDataChanged).not.toHaveBeenCalled();

    act(() => realtime.emit({ kind: "connection", state: "disconnected" }));
    act(() => realtime.emit({ kind: "connection", state: "connected" }));
    expect(onServerDataChanged).toHaveBeenCalledTimes(1);
  });

  it("stops listening when unmounted", async () => {
    const { realtime, view } = await renderSession([stubGateway("https://media.test", "t")]);
    expect(realtime.listenerCount).toBe(1);
    view.unmount();
    expect(realtime.listenerCount).toBe(0);
  });
});
