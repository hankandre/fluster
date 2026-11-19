import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeRealtime } from "../test/fake-realtime";
import { SessionProvider, useSession, type SessionGateway } from "./session";
import { fakeSessionGateway } from "../test/fake-session-gateway";

afterEach(cleanup);

function stubGateway(serverUrl: string, token: string): SessionGateway {
  return fakeSessionGateway({
    serverUrl,
    origin: new URL(serverUrl).origin,
    authorizationHeader: vi.fn().mockReturnValue(`MediaBrowser Token="${token}"`),
  });
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

describe("SessionProvider onAccountChanged", () => {
  async function renderWith(gateways: SessionGateway[], onAccountChanged: (gateway: SessionGateway | undefined) => void) {
    render(
      <SessionProvider createGateway={() => gateways[0]} onAccountChanged={onAccountChanged}>
        <Controls gateways={gateways} />
      </SessionProvider>,
    );
    await act(async () => undefined);
  }

  it("is not called on the first sign-in", async () => {
    const onAccountChanged = vi.fn();
    await renderWith([stubGateway("https://one.test", "a")], onAccountChanged);
    await click("sign in 0");
    expect(onAccountChanged).not.toHaveBeenCalled();
  });

  it("is called with undefined after a sign-out", async () => {
    const onAccountChanged = vi.fn();
    await renderWith([stubGateway("https://one.test", "a")], onAccountChanged);
    await click("sign in 0");
    await click("sign out");
    expect(onAccountChanged).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("is called with the new gateway when it replaces the signed-in one", async () => {
    const onAccountChanged = vi.fn();
    const gateways = [stubGateway("https://one.test", "a"), stubGateway("https://two.test", "b")];
    await renderWith(gateways, onAccountChanged);
    await click("sign in 0");
    await click("sign in 1");
    expect(onAccountChanged).toHaveBeenCalledExactlyOnceWith(gateways[1]);
  });
});

describe("SessionProvider signOut with revokeAfter", () => {
  function Probe({ gateways, revokeAfter }: { gateways: SessionGateway[]; revokeAfter: Promise<unknown> }) {
    const session = useSession();
    return (
      <>
        <button onClick={() => session.signIn(gateways[0])}>sign in 0</button>
        <button onClick={() => session.signIn(gateways[1])}>sign in 1</button>
        <button onClick={() => void session.signOut({ revokeAfter })}>sign out after</button>
        <p>{session.gateway ? "signed in" : "signed out"}</p>
      </>
    );
  }

  async function setup(revokeAfter: Promise<unknown>) {
    const gateways = [stubGateway("https://one.test", "a"), stubGateway("https://two.test", "b")];
    render(
      <SessionProvider createGateway={() => gateways[0]}>
        <Probe gateways={gateways} revokeAfter={revokeAfter} />
      </SessionProvider>,
    );
    await act(async () => undefined);
    await click("sign in 0");
    return gateways;
  }

  it("clears the gateway at once and revokes only after the promise settles", async () => {
    let release: () => void = () => undefined;
    const gateways = await setup(new Promise<void>((resolve) => { release = resolve; }));
    await click("sign out after");
    expect(screen.getByText("signed out")).toBeInTheDocument();
    expect(gateways[0].logout).not.toHaveBeenCalled();
    await act(async () => release());
    expect(gateways[0].logout).toHaveBeenCalledTimes(1);
  });

  it("still revokes when the promise rejects", async () => {
    const rejected = Promise.reject(new Error("report failed"));
    rejected.catch(() => undefined);
    const gateways = await setup(rejected);
    await click("sign out after");
    expect(gateways[0].logout).toHaveBeenCalledTimes(1);
  });

  it("never signs out a gateway that signed in during the wait", async () => {
    let release: () => void = () => undefined;
    const gateways = await setup(new Promise<void>((resolve) => { release = resolve; }));
    await click("sign out after");
    await click("sign in 1");
    await act(async () => release());
    expect(screen.getByText("signed in")).toBeInTheDocument();
    expect(gateways[0].logout).toHaveBeenCalledTimes(1);
    expect(gateways[1].logout).not.toHaveBeenCalled();
  });
});
