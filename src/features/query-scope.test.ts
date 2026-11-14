import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { fakeSessionGateway } from "../test/fake-session-gateway";
import { ACCOUNT_GC_TIME, dropOtherAccounts, markAccountDataStale, scopeFor, scopeOfKey } from "./query-scope";

const gatewayA = fakeSessionGateway();
const gatewayB = fakeSessionGateway();

function seed(client: QueryClient) {
  const a = scopeFor(gatewayA);
  const b = scopeFor(gatewayB);
  client.setQueryData(["browse", a, "views"], ["a"]);
  client.setQueryData(["browse", b, "views"], ["b"]);
  client.setQueryData(["player", "unscoped"], ["u"]);
  return { a, b };
}

describe("scopeOfKey", () => {
  it("reads the number at index 1", () => {
    expect(scopeOfKey(["home", 7, "resume"])).toBe(7);
  });

  it("is undefined when index 1 is not a number", () => {
    expect(scopeOfKey(["player", "x"])).toBeUndefined();
    expect(scopeOfKey(["player"])).toBeUndefined();
  });
});

describe("dropOtherAccounts", () => {
  it("keeps the new account's queries and removes the old account's and unscoped ones", () => {
    const client = new QueryClient();
    const { a, b } = seed(client);
    dropOtherAccounts(client, gatewayB);
    expect(client.getQueryData(["browse", b, "views"])).toEqual(["b"]);
    expect(client.getQueryData(["browse", a, "views"])).toBeUndefined();
    expect(client.getQueryData(["player", "unscoped"])).toBeUndefined();
  });

  it("removes everything when signed out", () => {
    const client = new QueryClient();
    seed(client);
    dropOtherAccounts(client, undefined);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("cancels an in-flight query of the old account so its result never lands", async () => {
    const client = new QueryClient();
    const a = scopeFor(gatewayA);
    let resolve!: (value: string) => void;
    const pending = client.fetchQuery({ queryKey: ["browse", a, "slow"], queryFn: () => new Promise<string>((r) => { resolve = r; }) });
    pending.catch(() => undefined);
    dropOtherAccounts(client, gatewayB);
    resolve("late");
    await new Promise((r) => setTimeout(r, 0));
    expect(client.getQueryData(["browse", a, "slow"])).toBeUndefined();
  });
});

describe("markAccountDataStale", () => {
  it("marks browse, detail, and search stale, leaves home alone, and fetches nothing for inactive queries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    const queryFn = vi.fn().mockResolvedValue("fresh");
    for (const key of [["browse", 1, "x"], ["detail", 1, "y"], ["search", 1, "z"], ["home", 1, "row"]]) {
      await client.fetchQuery({ queryKey: key, queryFn, staleTime: 60_000 });
    }
    queryFn.mockClear();
    markAccountDataStale(client);
    await new Promise((r) => setTimeout(r, 0));
    expect(client.getQueryState(["browse", 1, "x"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["detail", 1, "y"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["search", 1, "z"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["home", 1, "row"])?.isInvalidated).toBe(false);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("refetches a query that is open, so a change on another client appears", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    let value = "old";
    const queryFn = vi.fn(() => Promise.resolve(value));
    const observer = new QueryObserver(client, { queryKey: ["browse", 1, "open"], queryFn });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("old"));
    await client.fetchQuery({ queryKey: ["browse", 1, "closed"], queryFn, staleTime: 60_000 });
    queryFn.mockClear();
    value = "new";
    markAccountDataStale(client);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("new"));
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("kept data", () => {
  it("is kept forever until dropped", () => {
    expect(ACCOUNT_GC_TIME).toBe(Number.POSITIVE_INFINITY);
  });

  it("is never persisted: no persister package or import", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: object; devDependencies?: object };
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(names.filter((name) => /persist/i.test(name))).toEqual([]);
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && !/query-scope\.test\.ts$/.test(entry)) sources.push(path);
      }
    };
    walk("src");
    const offenders = sources.filter((path) => /@tanstack\/[\w-]*persist/i.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
