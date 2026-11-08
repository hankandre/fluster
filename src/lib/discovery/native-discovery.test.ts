import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_FAILED_MESSAGE } from "../../domain/server-discovery";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { NativeServerDiscovery } = await import("./native-discovery");

beforeEach(() => {
  invoke.mockReset();
});

describe("NativeServerDiscovery", () => {
  it("invokes discover_servers with no arguments and returns the servers", async () => {
    invoke.mockResolvedValue([{ name: "Den", id: "abc", address: "http://192.168.1.5:8096", extra: 1 }]);
    await expect(new NativeServerDiscovery().discover()).resolves.toEqual([
      { name: "Den", id: "abc", address: "http://192.168.1.5:8096" },
    ]);
    expect(invoke.mock.calls).toEqual([["discover_servers"]]);
  });

  it("drops malformed entries and caps the list", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ name: `S${index}`, id: `${index}`, address: "https://m.test" }));
    invoke.mockResolvedValue([null, "x", { name: 1, id: "a", address: "https://m.test" }, ...many]);
    const servers = await new NativeServerDiscovery().discover();
    expect(servers).toHaveLength(16);
    expect(servers[0]).toEqual({ name: "S0", id: "0", address: "https://m.test" });
  });

  it("replaces every failure with fixed text", async () => {
    invoke.mockRejectedValue("socket error at http://192.168.1.5:8096 token=secret");
    await expect(new NativeServerDiscovery().discover()).rejects.toThrow(DISCOVERY_FAILED_MESSAGE);
    invoke.mockResolvedValue({ not: "a list" });
    await expect(new NativeServerDiscovery().discover()).rejects.toThrow(DISCOVERY_FAILED_MESSAGE);
  });
});
