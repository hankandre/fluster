import { beforeEach, describe, expect, it, vi } from "vitest";

const constructed: unknown[][] = [];

vi.mock("../lib/jellyfin/gateway", () => ({
  JellyfinGateway: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
  },
}));

// The native media controls listen for a Tauri event; not under test here.
vi.mock("./media-controls", () => ({ createNativeMediaControls: () => undefined }));

import { lanHttpConfirmations } from "../lib/browser-lan-http-confirmations";
import { preferences, streamingLimits } from "../lib/browser-preference-store";
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
    for (const [, , installId, confirmations, limits] of constructed) {
      expect(installId).toBe(getInstallId());
      expect(confirmations).toBe(lanHttpConfirmations);
      expect(limits).toBe(streamingLimits);
    }
    expect(createServices().streamingLimits).toBe(streamingLimits);
  });

  it("exposes the preferences store and the limits as a view of it", () => {
    const services = createServices();
    expect(services.preferences).toBe(preferences);
    services.streamingLimits.set({ remoteMbps: 8 });
    try {
      expect(createServices().preferences.get().streamingLimits).toEqual({ remoteMbps: 8 });
    } finally {
      services.streamingLimits.set({});
      window.localStorage.clear();
    }
  });
});

describe("server discovery", () => {
  it("is absent in browser mode, where UDP is not available", () => {
    expect("__TAURI_INTERNALS__" in window).toBe(false);
    expect(createServices().discovery).toBeUndefined();
  });

  it("is the native adapter in the desktop shell", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    try {
      expect(createServices().discovery).toBeDefined();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
