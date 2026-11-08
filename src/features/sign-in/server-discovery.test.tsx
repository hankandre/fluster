import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../../app/session";
import {
  DISCOVERED_ID_MISMATCH_MESSAGE,
  DISCOVERY_FAILED_MESSAGE,
  type DiscoveredServer,
  type DiscoveryResult,
  type ServerDiscovery,
} from "../../domain/server-discovery";
import { JellyfinGateway } from "../../lib/jellyfin/gateway";
import type { HttpTransport } from "../../lib/jellyfin/types";
import type { LanHttpConfirmation, LanHttpConfirmationStore } from "../../lib/lan-http-confirmations";
import { SignInView } from "./index";
import { REFUSED_REPLY_MESSAGE } from "./server-discovery";

const LAN_SERVER: DiscoveredServer = {
  name: "Living Room",
  id: "server-1",
  address: "http://192.168.1.5:8096",
  advertisedBy: "192.168.1.5",
  addressIsSender: true,
  conflicting: false,
};
// The probe below reports Id "server-1"; Jellyfin may format it differently.
const HTTPS_SERVER: DiscoveredServer = {
  name: "Remote",
  id: "SERVER-1",
  address: "https://media.test",
  advertisedBy: "192.168.1.8",
  addressIsSender: false,
  conflicting: false,
};

function found(servers: DiscoveredServer[], refused = 0): Promise<DiscoveryResult> {
  return Promise.resolve({ servers, refused });
}

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

function fakeDiscovery(result: Promise<DiscoveryResult>): ServerDiscovery & { discover: ReturnType<typeof vi.fn> } {
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
    let finish: (result: DiscoveryResult) => void = () => undefined;
    const discovery = fakeDiscovery(new Promise((resolve) => { finish = resolve; }));
    renderView(discovery);
    await findServers();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Looking for Jellyfin servers on this network…");
    await act(async () => finish({ servers: [], refused: 0 }));
    expect(discovery.discover).toHaveBeenCalledTimes(1);
  });

  it("lists every server by name and address", async () => {
    renderView(fakeDiscovery(found([LAN_SERVER, HTTPS_SERVER])));
    await findServers();
    const list = screen.getByRole("list", { name: "Servers found on this network" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Living Room");
    expect(items[0]).toHaveTextContent("http://192.168.1.5:8096");
    expect(items[1]).toHaveTextContent("Remote");
    expect(items[1]).toHaveTextContent("https://media.test");
    expect(items[0]).toHaveTextContent("Advertised by 192.168.1.5");
    expect(items[0]).not.toHaveTextContent("another device");
    expect(items[1]).toHaveTextContent("Advertised by 192.168.1.8 · address points to another device");
  });

  it("lists both replies that claim the same server and marks them as conflicting", async () => {
    const spoofed = { ...LAN_SERVER, address: "http://192.168.1.66:8096", advertisedBy: "192.168.1.66", conflicting: true };
    renderView(fakeDiscovery(found([spoofed, { ...LAN_SERVER, conflicting: true }, HTTPS_SERVER])));
    await findServers();
    const items = within(screen.getByRole("list")).getAllByRole("button");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Conflict: more than one device claims to be this server.");
    expect(items[1]).toHaveTextContent("Conflict: more than one device claims to be this server.");
    expect(items[2]).not.toHaveTextContent("Conflict");
  });

  it("says a server answered with a refused address instead of no servers", async () => {
    renderView(fakeDiscovery(found([], 1)));
    await findServers();
    expect(screen.getByText(REFUSED_REPLY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/No servers answered/)).not.toBeInTheDocument();
  });

  it("explains when no server answered", async () => {
    renderView(fakeDiscovery(found([])));
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
    const { requests, created } = renderView(fakeDiscovery(found([LAN_SERVER])));
    await findServers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Living Room/ }));
    });
    expect(created).toEqual([LAN_SERVER.address]);
    expect(requests).toEqual(["GET /System/Info/Public"]);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("http://192.168.1.5:8096");
  });

  it("refuses a chosen server whose probe reports a different Id, before any confirmation or sign-in", async () => {
    const { requests } = renderView(fakeDiscovery(found([{ ...LAN_SERVER, id: "someone-else" }])));
    await findServers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Living Room/ }));
    });
    expect(requests).toEqual(["GET /System/Info/Public"]);
    expect(screen.getByRole("alert")).toHaveTextContent(DISCOVERED_ID_MISMATCH_MESSAGE);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
  });

  it("goes straight to sign-in after probing a chosen HTTPS server", async () => {
    const { requests, created } = renderView(fakeDiscovery(found([HTTPS_SERVER])));
    await findServers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Remote/ }));
    });
    expect(created).toEqual([HTTPS_SERVER.address]);
    expect(requests).toEqual(["GET /System/Info/Public", "GET /QuickConnect/Enabled"]);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByTestId("sign-in-origin")).toHaveTextContent("Signing in to https://media.test");
  });
});
