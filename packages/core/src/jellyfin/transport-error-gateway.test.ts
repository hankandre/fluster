import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import { classifyTransportError } from "../transport-error";
import { JellyfinGateway } from "./gateway";
import type { HttpTransport } from "./types";

// A PlaybackInfo request that fails the way Axios reports it.
function failingTransport(failure: Error): HttpTransport {
  return {
    async get() {
      throw new Error("unexpected GET");
    },
    async post<T>(url: string) {
      if (url === "/Users/AuthenticateByName") {
        return { data: { AccessToken: "test-token", User: { Id: "user-test", Name: "tester" } } as T };
      }
      throw failure;
    },
    async delete() {
      throw new Error("unexpected DELETE");
    },
  };
}

const item: LibraryItem = { id: "m1", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };

async function kindOfFailure(failure: Error) {
  const gateway = new JellyfinGateway("http://127.0.0.1:8096", failingTransport(failure), "install-1");
  await gateway.login("tester", "password");
  const error = await gateway.createPlaybackPlan(item, 0).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  return classifyTransportError(error);
}

const axios = (message: string, fields: Record<string, unknown>) => Object.assign(new Error(message), { isAxiosError: true }, fields);

describe("a failed PlaybackInfo request", () => {
  it("is classified by status or code, not by message", async () => {
    expect(await kindOfFailure(axios("Request failed with status code 500", { response: { status: 500 } }))).toBe("server");
    expect(await kindOfFailure(axios("Network Error", { code: "ERR_NETWORK" }))).toBe("network");
    expect(await kindOfFailure(axios("timeout of 30000ms exceeded", { code: "ECONNABORTED" }))).toBe("network");
    expect(await kindOfFailure(axios("Request failed with status code 400", { response: { status: 400 } }))).toBe("request");
  });
});
