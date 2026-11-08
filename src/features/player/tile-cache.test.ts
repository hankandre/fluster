import { afterEach, describe, expect, it, vi } from "vitest";
import { TileCache } from "./tile-cache";

afterEach(() => vi.restoreAllMocks());

describe("TileCache", () => {
  it("loads each tile once and revokes the URLs on dispose", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:tile");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchTile = vi.fn(async () => new Blob(["x"]));
    const cache = new TileCache(fetchTile);

    const [first, second] = await Promise.all([cache.load(3), cache.load(3)]);
    expect([first, second]).toEqual(["blob:tile", "blob:tile"]);
    await cache.load(3);
    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(cache.peek(3)).toBe("blob:tile");

    cache.dispose();
    expect(revoke).toHaveBeenCalledWith("blob:tile");
    expect(cache.peek(3)).toBeUndefined();
  });

  it("resolves to undefined when a tile fails, and tries again next time", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:tile");
    const fetchTile = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(new Blob(["x"]));
    const cache = new TileCache(fetchTile);
    await expect(cache.load(0)).resolves.toBeUndefined();
    await expect(cache.load(0)).resolves.toBe("blob:tile");
  });

  it("does not keep a tile that arrives after dispose", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late");
    let finish!: (blob: Blob) => void;
    const cache = new TileCache(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const pending = cache.load(1);
    cache.dispose();
    finish(new Blob(["x"]));
    await expect(pending).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
