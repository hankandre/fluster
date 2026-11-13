import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTvPlatform, exitRule, LEAVE_APP_EVENT, leaveApp } from "./leave-app";

afterEach(() => {
  delete document.documentElement.dataset.tvPlatform;
});

describe("exitRule", () => {
  it("leaves without a question except on Tizen", () => {
    expect(exitRule("android-tv")).toBe("leave");
    expect(exitRule("browser")).toBe("leave");
    expect(exitRule("tizen")).toBe("confirm");
  });
});

describe("currentTvPlatform", () => {
  it("reads the attribute at call time and defaults to the browser", () => {
    expect(currentTvPlatform()).toBe("browser");
    document.documentElement.dataset.tvPlatform = "tizen";
    expect(currentTvPlatform()).toBe("tizen");
    document.documentElement.dataset.tvPlatform = "android-tv";
    expect(currentTvPlatform()).toBe("android-tv");
    document.documentElement.dataset.tvPlatform = "webos";
    expect(currentTvPlatform()).toBe("browser");
  });
});

describe("leaveApp", () => {
  it("dispatches one leave event on window", () => {
    const listener = vi.fn();
    window.addEventListener(LEAVE_APP_EVENT, listener);
    leaveApp();
    window.removeEventListener(LEAVE_APP_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
