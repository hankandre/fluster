import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, type SessionGateway } from "../../app/session";
import { JellyfinGateway, PUBLIC_HTTP_REFUSED_MESSAGE } from "../../lib/jellyfin/gateway";
import type { LanHttpConfirmation, LanHttpConfirmationStore } from "../../lib/lan-http-confirmations";
import type { HttpTransport } from "../../lib/jellyfin/types";
import { SignInView } from "./index";
import { QUICK_CONNECT_POLL_MS } from "./sign-in-view";
import { SignInFailure } from "../../domain/sign-in-failure";
import { GENERIC_COPY, unreachableCopy, WRONG_PASSWORD_COPY } from "./sign-in-errors";
import { fakeSessionGateway } from "../../test/fake-session-gateway";

const NETWORK_ERROR = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK", isAxiosError: true });

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeSessionGateway({
    connect: vi.fn().mockResolvedValue({
      name: "Testfin",
      version: "10.11.7",
      hostClass: "public",
      needsUnencryptedConfirmation: false,
    }),
    login: vi.fn().mockResolvedValue({ userId: "u1", username: "Louise" }),
    quickConnectEnabled: vi.fn().mockResolvedValue(true),
    initiateQuickConnect: vi.fn().mockResolvedValue({ secret: "s3cret", code: "482913" }),
    pollQuickConnect: vi.fn().mockResolvedValue({ authenticated: false }),
    authenticateWithQuickConnect: vi.fn().mockResolvedValue({ userId: "u1", username: "Louise" }),
    imageUrl: vi.fn(),
    ...overrides,
  });
}

function renderView(gateway: SessionGateway) {
  render(
    <SessionProvider createGateway={() => gateway}>
      <SignInView />
    </SessionProvider>,
  );
}

async function connect(serverUrl = "https://media.test") {
  fireEvent.change(screen.getByLabelText("Server URL"), { target: { value: serverUrl } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  });
}

beforeEach(() => {
  window.location.hash = "#/next/sign-in";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SignInView with Quick Connect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("shows the code and the waiting state when Quick Connect is enabled", async () => {
    renderView(fakeGateway());
    await connect();
    expect(screen.getByLabelText("Quick Connect code")).toHaveTextContent("482913");
    expect(screen.getByText("Waiting for approval…")).toBeInTheDocument();
  });

  it("signs in and opens Home after the code is approved", async () => {
    const gateway = fakeGateway({
      pollQuickConnect: vi.fn()
        .mockResolvedValueOnce({ authenticated: false })
        .mockResolvedValueOnce({ authenticated: true }),
    });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(gateway.authenticateWithQuickConnect).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(gateway.pollQuickConnect).toHaveBeenCalledWith("s3cret", expect.any(AbortSignal));
    expect(gateway.authenticateWithQuickConnect).toHaveBeenCalledWith("s3cret", expect.any(AbortSignal));
    expect(window.location.hash).toBe("#/next/home");
  });

  it("stops polling when Change server is pressed", async () => {
    const gateway = fakeGateway();
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(gateway.pollQuickConnect).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(gateway.pollQuickConnect).mock.calls[0][1]!;

    fireEvent.click(screen.getByRole("button", { name: "Change server" }));
    expect(signal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 5));
    expect(gateway.pollQuickConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
  });

  it("stops polling when the view unmounts", async () => {
    const gateway = fakeGateway();
    renderView(gateway);
    await connect();
    cleanup();
    await vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 5);
    expect(gateway.pollQuickConnect).not.toHaveBeenCalled();
  });

  it("does not sign in when Change server arrives during authenticate, even if the request ignores abort", async () => {
    let finish: () => void = () => undefined;
    const gateway = fakeGateway({
      pollQuickConnect: vi.fn().mockResolvedValue({ authenticated: true }),
      authenticateWithQuickConnect: vi.fn().mockImplementation(() => new Promise((resolve) => {
        finish = () => resolve({ userId: "u1", username: "Louise" });
      })),
    });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(gateway.authenticateWithQuickConnect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change server" }));
    await act(async () => finish());
    expect(window.location.hash).toBe("#/next/sign-in");
    expect(gateway.logout).toHaveBeenCalledTimes(1);
  });

  it("tolerates transient poll errors", async () => {
    const gateway = fakeGateway({
      pollQuickConnect: vi.fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({ authenticated: true }),
    });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/next/home");
  });

  it("stops after three consecutive poll failures", async () => {
    const gateway = fakeGateway({ pollQuickConnect: vi.fn().mockRejectedValue(NETWORK_ERROR) });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 6));
    expect(gateway.pollQuickConnect).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert")).toHaveTextContent(unreachableCopy("https://media.test"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Network Error");
    expect(screen.getByRole("button", { name: "Start again" })).toBeInTheDocument();
  });

  it("offers a restart when the code has expired (404)", async () => {
    const expired = Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } });
    const gateway = fakeGateway({
      pollQuickConnect: vi.fn().mockRejectedValueOnce(expired).mockResolvedValue({ authenticated: false }),
      initiateQuickConnect: vi.fn()
        .mockResolvedValueOnce({ secret: "a", code: "111111" })
        .mockResolvedValueOnce({ secret: "b", code: "222222" }),
    });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(screen.getByRole("alert")).toHaveTextContent("This code expired.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("404");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Start again" })).toBeInTheDocument();
    const again = screen.getByRole("button", { name: "Start again" });
    again.focus();
    await act(async () => {
      fireEvent.click(again);
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getByLabelText("Quick Connect code")).toHaveTextContent("222222");
    expect(screen.getByText("Waiting for approval…")).toBeInTheDocument();
  });

  it("treats an axios CanceledError as an abort, not a failure", async () => {
    const canceled = Object.assign(new Error("canceled"), { name: "CanceledError" });
    const gateway = fakeGateway({ pollQuickConnect: vi.fn().mockRejectedValue(canceled) });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a polling failure and keeps the password fallback", async () => {
    const gateway = fakeGateway({ pollQuickConnect: vi.fn().mockRejectedValue(new Error("Request failed with status code 500")) });
    // Three consecutive failures are needed before the error is shown.
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 3));
    expect(screen.getByRole("alert")).toHaveTextContent(GENERIC_COPY);
    expect(screen.getByRole("alert")).not.toHaveTextContent("500");
    expect(screen.getByRole("button", { name: "Use password" })).toBeInTheDocument();
  });
});

describe("SignInView shows the server origin", () => {
  it("names the origin on the Quick Connect step", async () => {
    vi.useFakeTimers();
    renderView(fakeGateway({ origin: "https://typed.test" }));
    await connect("https://typed.test");
    expect(screen.getByTestId("sign-in-origin")).toHaveTextContent("Signing in to https://typed.test");
  });

  it("names the origin on the password step", async () => {
    renderView(fakeGateway({ origin: "https://typed.test", quickConnectEnabled: vi.fn().mockResolvedValue(false) }));
    await connect("https://typed.test");
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByTestId("sign-in-origin")).toHaveTextContent("Signing in to https://typed.test");
  });
});

describe("SignInView with password", () => {
  it("goes straight to the password form when Quick Connect is disabled", async () => {
    const gateway = fakeGateway({ quickConnectEnabled: vi.fn().mockResolvedValue(false) });
    renderView(gateway);
    await connect();
    expect(gateway.initiateQuickConnect).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("falls back to the password form and signs in with Enter", async () => {
    const gateway = fakeGateway();
    renderView(gateway);
    await connect();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Use password" }));
    await user.type(screen.getByLabelText("Username"), "Louise");
    await user.type(screen.getByLabelText("Password"), "hunter2{Enter}");
    expect(gateway.login).toHaveBeenCalledWith("Louise", "hunter2", expect.any(AbortSignal));
    expect(window.location.hash).toBe("#/next/home");
  });

  it("shows a connection error and stays on the server step", async () => {
    const gateway = fakeGateway({ connect: vi.fn().mockRejectedValue(new SignInFailure("unsupported-version", "Fluster needs Jellyfin 10.11 or newer; this server reports 10.9.0.")) });
    renderView(gateway);
    await connect();
    expect(screen.getByRole("alert")).toHaveTextContent("10.11 or newer");
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
  });
});

const LAN_ORIGIN = "http://192.168.1.5:8096";

function lanGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return fakeGateway({
    serverUrl: LAN_ORIGIN,
    origin: LAN_ORIGIN,
    connect: vi.fn().mockResolvedValue({
      name: "Living Room",
      version: "10.11.7",
      hostClass: "private-lan",
      needsUnencryptedConfirmation: true,
    }),
    ...overrides,
  });
}

function expectNoSignInRequest(gateway: SessionGateway) {
  expect(gateway.quickConnectEnabled).not.toHaveBeenCalled();
  expect(gateway.initiateQuickConnect).not.toHaveBeenCalled();
  expect(gateway.login).not.toHaveBeenCalled();
}

describe("SignInView with a private-LAN HTTP server", () => {
  it("warns with the server name and exact origin, with Cancel focused", async () => {
    const gateway = lanGateway();
    renderView(gateway);
    await connect(LAN_ORIGIN);
    const dialog = screen.getByRole("alertdialog", { name: "This server uses an unencrypted connection." });
    expect(dialog).toHaveTextContent("Your Jellyfin password and sign-in token will travel across your network without encryption.");
    expect(dialog).toHaveTextContent("Anyone else on this network could read them and use your account.");
    expect(dialog).toHaveTextContent(`Fluster will remember this choice for “Living Room” at ${LAN_ORIGIN}.`);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expectNoSignInRequest(gateway);
    expect(gateway.confirmUnencryptedConnection).not.toHaveBeenCalled();
  });

  it("records the confirmation before any sign-in request, then continues", async () => {
    const order: string[] = [];
    const gateway = lanGateway({
      confirmUnencryptedConnection: vi.fn(() => { order.push("confirm"); }),
      quickConnectEnabled: vi.fn(async () => {
        order.push("quick-connect-enabled");
        return false;
      }),
    });
    renderView(gateway);
    await connect(LAN_ORIGIN);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect without encryption" }));
    });
    expect(order).toEqual(["confirm", "quick-connect-enabled"]);
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("returns to the server step on Cancel without confirming", async () => {
    const gateway = lanGateway();
    renderView(gateway);
    await connect(LAN_ORIGIN);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(gateway.confirmUnencryptedConnection).not.toHaveBeenCalled();
    expectNoSignInRequest(gateway);
  });

  it("cancels on Escape", async () => {
    const gateway = lanGateway();
    renderView(gateway);
    await connect(LAN_ORIGIN);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(gateway.confirmUnencryptedConnection).not.toHaveBeenCalled();
  });

  describe("when the user cancels while the connection is pending", () => {
    function pendingGateway() {
      let release: () => void = () => {};
      const gateway = lanGateway({
        quickConnectEnabled: vi.fn(() => new Promise<boolean>((resolve) => { release = () => resolve(true); })),
      });
      return { gateway, release: () => release() };
    }

    async function startConfirming(gateway: SessionGateway) {
      renderView(gateway);
      await connect(LAN_ORIGIN);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Connect without encryption" }));
      });
      expect(gateway.quickConnectEnabled).toHaveBeenCalled();
    }

    it("stays on the server step and stores no consent after Cancel", async () => {
      const { gateway, release } = pendingGateway();
      await startConfirming(gateway);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await act(async () => { release(); });
      expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
      expect(screen.queryByLabelText("Quick Connect code")).not.toBeInTheDocument();
      expect(gateway.forgetUnencryptedConnection).toHaveBeenCalledTimes(1);
      expect(gateway.login).not.toHaveBeenCalled();
    });

    it("behaves the same on Escape", async () => {
      const { gateway, release } = pendingGateway();
      await startConfirming(gateway);
      fireEvent.keyDown(document, { key: "Escape" });
      await act(async () => { release(); });
      expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
      expect(screen.queryByLabelText("Quick Connect code")).not.toBeInTheDocument();
      expect(gateway.forgetUnencryptedConnection).toHaveBeenCalledTimes(1);
    });
  });

  it("skips the warning once the server is confirmed at this origin", async () => {
    const gateway = lanGateway({
      connect: vi.fn().mockResolvedValue({
        name: "Living Room",
        version: "10.11.7",
        hostClass: "private-lan",
        needsUnencryptedConfirmation: false,
      }),
    });
    renderView(gateway);
    await connect(LAN_ORIGIN);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quick Connect code")).toHaveTextContent("482913");
  });
});

class MemoryConfirmations implements LanHttpConfirmationStore {
  records: LanHttpConfirmation[] = [];
  has(confirmation: LanHttpConfirmation): boolean {
    return this.records.some((record) => record.serverId === confirmation.serverId && record.origin === confirmation.origin);
  }
  remember(confirmation: LanHttpConfirmation): void {
    this.records.push(confirmation);
  }
  forget(confirmation: LanHttpConfirmation): void {
    this.records = this.records.filter((record) => !(record.serverId === confirmation.serverId && record.origin === confirmation.origin));
  }
}

// These use the real gateway, so they prove what reaches the network.
describe("SignInView with the real gateway", () => {
  function countingTransport(responses: Record<string, unknown>) {
    const requests: string[] = [];
    const transport: HttpTransport = {
      async get<T>(url: string) {
        requests.push(`GET ${url}`);
        return { data: responses[`GET ${url}`] as T };
      },
      async post<T>(url: string) {
        requests.push(`POST ${url}`);
        return { data: responses[`POST ${url}`] as T };
      },
      async delete<T>(url: string) {
        requests.push(`DELETE ${url}`);
        return { data: responses[`DELETE ${url}`] as T };
      },
    };
    return { transport, requests };
  }

  function renderWithRealGateway(transport: HttpTransport, confirmations: LanHttpConfirmationStore) {
    render(
      <SessionProvider createGateway={(serverUrl) => new JellyfinGateway(serverUrl, transport, "install-1", confirmations)}>
        <SignInView />
      </SessionProvider>,
    );
  }

  it("refuses a public http:// server without sending any request", async () => {
    const { transport, requests } = countingTransport({});
    renderWithRealGateway(transport, new MemoryConfirmations());
    await connect("http://media.example:8096");
    expect(screen.getByRole("alert")).toHaveTextContent(PUBLIC_HTTP_REFUSED_MESSAGE);
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("removes consent on Cancel and asks again when the same URL is re-submitted during the request", async () => {
    let release: (value: unknown) => void = () => {};
    const requests: string[] = [];
    const transport: HttpTransport = {
      async get<T>(url: string) {
        requests.push(`GET ${url}`);
        if (url === "/QuickConnect/Enabled") return { data: await new Promise((resolve) => { release = resolve; }) as T };
        return { data: { ServerName: "Living Room", Version: "10.11.7", Id: "server-1" } as T };
      },
      async post<T>() { return { data: undefined as T }; },
      async delete<T>() { return { data: undefined as T }; },
    };
    const confirmations = new MemoryConfirmations();
    renderWithRealGateway(transport, confirmations);
    await connect(LAN_ORIGIN);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect without encryption" }));
    });
    expect(confirmations.records).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirmations.records).toEqual([]);
    await connect(LAN_ORIGIN);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () => { release(true); });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(confirmations.records).toEqual([]);
  });

  it("probes a private-LAN server, then sends nothing else until the user confirms", async () => {
    const { transport, requests } = countingTransport({
      "GET /System/Info/Public": { ServerName: "Living Room", Version: "10.11.7", Id: "server-1" },
      "GET /QuickConnect/Enabled": false,
    });
    const confirmations = new MemoryConfirmations();
    renderWithRealGateway(transport, confirmations);
    await connect(`${LAN_ORIGIN}/`);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(LAN_ORIGIN);
    expect(requests).toEqual(["GET /System/Info/Public"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect without encryption" }));
    });
    expect(confirmations.records).toEqual([{ serverId: "server-1", origin: LAN_ORIGIN }]);
    expect(requests).toEqual(["GET /System/Info/Public", "GET /QuickConnect/Enabled"]);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("asks again when a different server answers at a confirmed origin", async () => {
    const { transport } = countingTransport({
      "GET /System/Info/Public": { ServerName: "Imposter", Version: "10.11.7", Id: "server-2" },
    });
    const confirmations = new MemoryConfirmations();
    confirmations.remember({ serverId: "server-1", origin: LAN_ORIGIN });
    renderWithRealGateway(transport, confirmations);
    await connect(LAN_ORIGIN);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("“Imposter”");
  });
});

describe("SignInView steps", () => {
  function expectOneQuestion(title: string) {
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(document.body).not.toHaveTextContent(/STEP \d/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  }

  it("asks one question on each step", async () => {
    vi.useFakeTimers();
    renderView(fakeGateway());
    expectOneQuestion("Where is your Jellyfin server?");
    await connect();
    expectOneQuestion("Approve this code in Jellyfin");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(document.querySelector(".ui-button--primary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use password" }));
    expectOneQuestion("Who is signing in?");
  });

  it("shows the wrong-password row on the password step", async () => {
    const unauthorized = Object.assign(new Error("Request failed with status code 401"), { response: { status: 401 } });
    renderView(fakeGateway({
      quickConnectEnabled: vi.fn().mockResolvedValue(false),
      login: vi.fn().mockRejectedValue(unauthorized),
    }));
    await connect();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "Louise");
    await user.type(screen.getByLabelText("Password"), "nope{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(WRONG_PASSWORD_COPY);
    expect(screen.getByRole("alert")).not.toHaveTextContent("401");
  });

  it("does not call a 401 from the server probe a wrong password", async () => {
    const unauthorized = Object.assign(new Error("Request failed with status code 401"), { response: { status: 401 } });
    renderView(fakeGateway({ connect: vi.fn().mockRejectedValue(unauthorized) }));
    await connect();
    expect(screen.getByRole("alert")).toHaveTextContent(GENERIC_COPY);
  });

  it("names the address when the server cannot be reached", async () => {
    renderView(fakeGateway({ connect: vi.fn().mockRejectedValue(NETWORK_ERROR) }));
    await connect();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach https://media.test. Check the address and that the server is running.");
  });
});

describe("SignInView unencrypted dialog", () => {
  it("is a modal alertdialog with the origin in Mono and Tab staying inside", async () => {
    renderView(lanGateway());
    await connect(LAN_ORIGIN);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("ui-dialog");
    expect(within(dialog).getByText(LAN_ORIGIN).tagName).toBe("CODE");
    const user = userEvent.setup();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("returns focus to the Server URL field after Escape", async () => {
    renderView(lanGateway());
    const user = userEvent.setup();
    const field = screen.getByLabelText("Server URL");
    await user.type(field, `${LAN_ORIGIN}{Enter}`);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("returns focus to Connect after Escape when the dialog was opened by clicking Connect", async () => {
    renderView(lanGateway());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Server URL"), LAN_ORIGIN);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    const connectButton = screen.getByRole("button", { name: "Connect" });
    expect(connectButton).toHaveFocus();
    expect(connectButton).not.toBeDisabled();
    expect(connectButton).not.toHaveAttribute("aria-disabled");
  });

  it("does not submit twice while a connect is running", async () => {
    const gateway = lanGateway();
    renderView(gateway);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Server URL"), LAN_ORIGIN);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("alertdialog");
    expect(gateway.connect).toHaveBeenCalledTimes(1);
  });
});

