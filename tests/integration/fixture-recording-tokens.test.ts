import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSaver, makeScrubber, watchSignIns } from "./fixture-recording.mjs";

// T2-08 review: a second session's token must reach `secrets`, so the saver refuses a body that holds it.
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

function fakeFetch(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("watchSignIns", () => {
  it("adds the token of a sign-in answer and leaves the body readable", async () => {
    const secrets = ["first"];
    fakeFetch({ AccessToken: "second-token" });
    const stop = watchSignIns(secrets);
    const response = await fetch("http://x.test/Users/AuthenticateByName", { method: "POST" });
    expect(((await response.json()) as { AccessToken: string }).AccessToken).toBe("second-token");
    expect(secrets).toEqual(["first", "second-token"]);
    stop();
    expect(globalThis.fetch).not.toBe(undefined);
  });

  it("ignores other routes and failed sign-ins", async () => {
    const secrets: string[] = [];
    fakeFetch({ AccessToken: "nope" });
    const stop = watchSignIns(secrets);
    await fetch("http://x.test/UserViews");
    fakeFetch({ AccessToken: "bad" }, 401);
    await fetch("http://x.test/Users/AuthenticateByName");
    expect(secrets).toEqual([]);
    stop();
  });

  it("makes the saver refuse a token the scrubber does not mask", () => {
    const secrets = ["raw"];
    fakeFetch({ AccessToken: "late-token" });
    const stop = watchSignIns(secrets);
    return fetch("http://x.test/Users/AuthenticateByName").then(() => {
      stop();
      const scrub = makeScrubber({ tokens: [], host: "x.test", fakeUserIds: [], fakeServerId: { real: "s", fake: "s" }, knownIds: new Map(), serverNames: [] });
      const save = makeSaver({ outDir: "/nonexistent", folder: "f", scrub, secrets });
      expect(() => save("x", { Path: "/Videos/x/late-token/sub.vtt" })).toThrow(/token leaked/);
    });
  });
});
