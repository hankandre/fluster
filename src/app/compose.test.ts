import { beforeEach, describe, expect, it, vi } from "vitest";

const constructed: unknown[][] = [];

vi.mock("../lib/jellyfin/gateway", () => ({
  JellyfinGateway: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
  },
}));

import { lanHttpConfirmations } from "../lib/browser-lan-http-confirmations";
import { getInstallId } from "../lib/install-id";
import { createServices } from "./compose";

describe("createServices", () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  // The gateway's own defaults are a random install id and an in-memory
  // store, so the app must pass the persistent ones or the device id changes
  // every launch and LAN HTTP confirmations are forgotten.
  it("builds every gateway with the persistent install id and LAN HTTP confirmations", () => {
    createServices().createGateway("https://media.test");
    createServices().createGateway("https://other.test");

    expect(constructed).toHaveLength(2);
    for (const [, , installId, confirmations] of constructed) {
      expect(installId).toBe(getInstallId());
      expect(confirmations).toBe(lanHttpConfirmations);
    }
  });
});
