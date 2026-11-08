import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../../app/session";
import { DISCOVERY_FAILED_MESSAGE, type DiscoveredServer, type ServerDiscovery } from "../../domain/server-discovery";
import { JellyfinGateway } from "../../lib/jellyfin/gateway";
import type { HttpTransport } from "../../lib/jellyfin/types";
import type { LanHttpConfirmation, LanHttpConfirmationStore } from "../../lib/lan-http-confirmations";
import { SignInView } from "./index";

const LAN_SERVER: DiscoveredServer = { name: "Living Room", id: "server-1", address: "http://192.168.1.5:8096" };
const HTTPS_SERVER: DiscoveredServer = { name: "Remote", id: "server-2", address: "https://media.test" };

class MemoryConfirmations implements LanHttpConfirmationStore {
  records: LanHttpConfirmation[] = [];
  has(confirmation: LanHttpConfirmation): boolean {
    return this.records.some((record) => record.serverId === confirmation.serverId && record.origin === confirmation.origin);
  }
  remember(confirmation: LanHttpConfirmation): void {
    this.records.push(confirmation);
  }
}

// Records every request with its origin, so tests prove what was probed.
function countingTransport() {
  const requests: string[] = [];
  const responses: Record<string, unknown> = {
    "GET /System/Info/Public": { ServerName: "Living Room", Version: "10.11.7", Id: "server-1" },
    "GET /QuickConnect/Enabled": false,
  };
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

function fakeDiscovery(result: Promise<DiscoveredServer[]>): ServerDiscovery & { discover: ReturnType<typeof vi.fn> } {
  return { discover: vi.fn(() => result) };
}

function renderView(discovery: ServerDiscovery | undefined) {
  const { transport, requests } = countingTransport();
  const created: string[] = [];
  render(
    <SessionProvider
      createGateway={(serverUrl) => {
        created.push(serverUrl);
        return new JellyfinGateway(serverUrl, transport, "install-1", new MemoryConfirmations());
      }}
    >
      <SignInView discovery={discovery} />
    </SessionProvider>,
  );
  return { requests, created };
}

async function findServers() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Find servers on this network" }));
  });
}

beforeEach(() => {
  window.location.hash = "#/next/sign-in";
});

afterEach(() => {
  cleanup();
});

describe("Find servers on this network", () => {
  it("is hidden when the shell has no discovery (browser mode)", () => {
    renderView(undefined);
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find servers on this network" })).not.toBeInTheDocument();
  });

  it("shows a loading state while searching", async () => {
    let finish: (servers: DiscoveredServer[]) => void = () => undefined;
    const discovery = fakeDiscovery(new Promise((resolve) => { finish = resolve; }));
    renderView(discovery);
    await findServers();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Looking for Jellyfin servers on this network…");
    await act(async () => finish([]));
    expect(discovery.discover).toHaveBeenCalledTimes(1);
  });

  it("lists every server by name and address", async () => {
    renderView(fakeDiscovery(Promise.resolve([LAN_SERVER, HTTPS_SERVER])));
    await findServers();
    const list = screen.getByRole("list", { name: "Servers found on this network" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Living Room");
    expect(items[0]).toHaveTextContent("http://192.168.1.5:8096");
    expect(items[1]).toHaveTextContent("Remote");
    expect(items[1]).toHaveTextContent("https://media.test");
  });

  it("explains when no server answered", async () => {
    renderView(fakeDiscovery(Promise.resolve([])));
    await findServers();
    expect(screen.getByRole("status")).toHaveTextContent("No servers answered.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows only fixed text when the search fails", async () => {
    renderView(fakeDiscovery(Promise.reject(new Error("bind failed http://192.168.1.5:8096 token=secret"))));
    await findServers();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(DISCOVERY_FAILED_MESSAGE);
    expect(alert).not.toHaveTextContent("192.168");
    expect(alert).not.toHaveTextContent("secret");
  });

  it("probes /System/Info/Public on the chosen private-LAN server and asks to confirm plain HTTP", async () => {
    const { requests, created } = renderView(fakeDiscovery(Promise.resolve([LAN_SERVER])));
    await findServers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Living Room/ }));
    });
    expect(created).toEqual([LAN_SERVER.address]);
    expect(requests).toEqual(["GET /System/Info/Public"]);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("http://192.168.1.5:8096");
  });

  it("goes straight to sign-in after probing a chosen HTTPS server", async () => {
    const { requests, created } = renderView(fakeDiscovery(Promise.resolve([HTTPS_SERVER])));
    await findServers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Remote/ }));
    });
    expect(created).toEqual([HTTPS_SERVER.address]);
    expect(requests).toEqual(["GET /System/Info/Public", "GET /QuickConnect/Enabled"]);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });
});
