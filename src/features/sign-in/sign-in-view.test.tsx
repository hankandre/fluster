import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, type SessionGateway } from "../../app/session";
import { SignInView } from "./index";
import { QUICK_CONNECT_POLL_MS } from "./sign-in-view";

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    connect: vi.fn().mockResolvedValue({ name: "Testfin", version: "10.11.7" }),
    login: vi.fn().mockResolvedValue({ userId: "u1", username: "Louise" }),
    quickConnectEnabled: vi.fn().mockResolvedValue(true),
    initiateQuickConnect: vi.fn().mockResolvedValue({ secret: "s3cret", code: "482913" }),
    pollQuickConnect: vi.fn().mockResolvedValue({ authenticated: false }),
    authenticateWithQuickConnect: vi.fn().mockResolvedValue({ userId: "u1", username: "Louise" }),
    logout: vi.fn().mockResolvedValue(undefined),
    userViews: vi.fn(),
    resumeItems: vi.fn(),
    nextUp: vi.fn(),
    latestInLibrary: vi.fn(),
    libraryItems: vi.fn(),
    searchHints: vi.fn(),
    searchItems: vi.fn(),
    seasons: vi.fn(),
    episodes: vi.fn(),
    imageUrl: vi.fn(),
    ...overrides,
  };
}

function renderView(gateway: SessionGateway) {
  render(
    <SessionProvider createGateway={() => gateway}>
      <SignInView />
    </SessionProvider>,
  );
}

async function connect() {
  fireEvent.change(screen.getByLabelText("Server URL"), { target: { value: "https://media.test" } });
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

  it("stops polling when Cancel is pressed", async () => {
    const gateway = fakeGateway();
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS));
    expect(gateway.pollQuickConnect).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(gateway.pollQuickConnect).mock.calls[0][1]!;

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
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

  it("does not sign in when Cancel arrives during authenticate, even if the request ignores abort", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
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
    const gateway = fakeGateway({ pollQuickConnect: vi.fn().mockRejectedValue(new Error("network down")) });
    renderView(gateway);
    await connect();
    await act(() => vi.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 6));
    expect(gateway.pollQuickConnect).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
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
    expect(screen.getByRole("alert")).toHaveTextContent("This code expired. Start again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("404");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    });
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
    expect(screen.getByRole("alert")).toHaveTextContent("status code 500");
    expect(screen.getByRole("button", { name: "Use password instead" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Use password instead" }));
    await user.type(screen.getByLabelText("Username"), "Louise");
    await user.type(screen.getByLabelText("Password"), "hunter2{Enter}");
    expect(gateway.login).toHaveBeenCalledWith("Louise", "hunter2", expect.any(AbortSignal));
    expect(window.location.hash).toBe("#/next/home");
  });

  it("shows a connection error and stays on the server step", async () => {
    const gateway = fakeGateway({ connect: vi.fn().mockRejectedValue(new Error("Fluster needs Jellyfin 10.11 or newer.")) });
    renderView(gateway);
    await connect();
    expect(screen.getByRole("alert")).toHaveTextContent("10.11 or newer");
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
  });
});
