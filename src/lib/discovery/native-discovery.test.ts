import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_FAILED_MESSAGE } from "../../domain/server-discovery";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { NativeServerDiscovery } = await import("./native-discovery");

const DEN = {
  name: "Den",
  id: "abc",
  address: "http://192.168.1.5:8096",
  advertisedBy: "192.168.1.5",
  addressIsSender: true,
  conflicting: false,
};

beforeEach(() => {
  invoke.mockReset();
});

describe("NativeServerDiscovery", () => {
  it("invokes discover_servers with no arguments and returns the servers and refused count", async () => {
    invoke.mockResolvedValue({ servers: [{ ...DEN, extra: 1 }], refused: 2 });
    await expect(new NativeServerDiscovery().discover()).resolves.toEqual({ servers: [DEN], refused: 2 });
    expect(invoke.mock.calls).toEqual([["discover_servers"]]);
  });

  it("drops malformed entries, caps the list, and ignores a bad refused count", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ ...DEN, id: `${index}` }));
    invoke.mockResolvedValue({
      servers: [null, "x", { ...DEN, name: 1 }, { ...DEN, conflicting: "yes" }, { name: "a", id: "b", address: "c" }, ...many],
      refused: "lots",
    });
    const result = await new NativeServerDiscovery().discover();
    expect(result.servers).toHaveLength(16);
    expect(result.servers[0]).toEqual({ ...DEN, id: "0" });
    expect(result.refused).toBe(0);
  });

  it("replaces every failure with fixed text", async () => {
    invoke.mockRejectedValue("socket error at http://192.168.1.5:8096 token=secret");
    await expect(new NativeServerDiscovery().discover()).rejects.toThrow(DISCOVERY_FAILED_MESSAGE);
    invoke.mockResolvedValue([DEN]);
    await expect(new NativeServerDiscovery().discover()).rejects.toThrow(DISCOVERY_FAILED_MESSAGE);
    invoke.mockResolvedValue(null);
    await expect(new NativeServerDiscovery().discover()).rejects.toThrow(DISCOVERY_FAILED_MESSAGE);
  });
});
