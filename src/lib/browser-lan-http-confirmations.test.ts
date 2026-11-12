import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserLanHttpConfirmations, LAN_HTTP_CONFIRMATIONS_STORAGE_KEY } from "./browser-lan-http-confirmations";

const LIVING_ROOM = { serverId: "server-1", origin: "http://192.168.1.5:8096" };

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("BrowserLanHttpConfirmations", () => {
  it("remembers a server Id and origin pair across instances", () => {
    new BrowserLanHttpConfirmations().remember(LIVING_ROOM);
    const store = new BrowserLanHttpConfirmations();
    expect(store.has(LIVING_ROOM)).toBe(true);
    expect(store.has({ ...LIVING_ROOM, serverId: "server-2" })).toBe(false);
    expect(store.has({ ...LIVING_ROOM, origin: "http://192.168.1.5:8920" })).toBe(false);
  });

  it("stores only the server Id and origin, once", () => {
    const store = new BrowserLanHttpConfirmations();
    store.remember({ ...LIVING_ROOM, token: "top-secret" } as typeof LIVING_ROOM);
    store.remember(LIVING_ROOM);
    expect(JSON.parse(window.localStorage.getItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY)!)).toEqual([LIVING_ROOM]);
  });

  it("forgets one pair and keeps the others", () => {
    const other = { serverId: "server-2", origin: "http://192.168.1.6:8096" };
    const store = new BrowserLanHttpConfirmations();
    store.remember(LIVING_ROOM);
    store.remember(other);
    store.forget(LIVING_ROOM);
    expect(store.has(LIVING_ROOM)).toBe(false);
    expect(new BrowserLanHttpConfirmations().has(LIVING_ROOM)).toBe(false);
    expect(store.has(other)).toBe(true);
  });

  it("forgets an in-memory record when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = new BrowserLanHttpConfirmations();
    store.remember(LIVING_ROOM);
    store.forget(LIVING_ROOM);
    expect(store.has(LIVING_ROOM)).toBe(false);
  });

  it("ignores corrupt or foreign stored values", () => {
    window.localStorage.setItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY, "not json");
    expect(new BrowserLanHttpConfirmations().has(LIVING_ROOM)).toBe(false);
    window.localStorage.setItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY, JSON.stringify([{ serverId: 1 }, "x", LIVING_ROOM]));
    expect(new BrowserLanHttpConfirmations().has(LIVING_ROOM)).toBe(true);
  });

  it("keeps a confirmation in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = new BrowserLanHttpConfirmations();
    expect(store.has(LIVING_ROOM)).toBe(false);
    store.remember(LIVING_ROOM);
    expect(store.has(LIVING_ROOM)).toBe(true);
  });
});
