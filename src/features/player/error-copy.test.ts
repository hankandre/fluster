import { describe, expect, it } from "vitest";
import { REPORT_FAILED_WARNING } from "../../lib/player/playstate-reporter";
import { playbackErrorCopy, reportingWarningCopy } from "./error-copy";

describe("playbackErrorCopy", () => {
  it("uses the approved copy for each transport kind", () => {
    expect(playbackErrorCopy("x", "network", "Hearth")).toBe("Couldn't reach Hearth. Check that the server is on, then try again.");
    expect(playbackErrorCopy("x", "server", "Hearth")).toBe("Hearth had a problem starting playback. Try again in a moment.");
    expect(playbackErrorCopy("x", "request", "Hearth")).toBe("Something went wrong starting playback. Try again.");
  });

  it("keeps filtering a native error with safeReason", () => {
    expect(playbackErrorCopy("open failed rtsp://10.0.0.5/cam at /home/me/a.mkv", undefined, "Hearth")).toBe("open failed [address] at [path]");
  });
});

describe("reportingWarningCopy", () => {
  it("shows plain copy for a failed report and filters the app's own texts", () => {
    expect(reportingWarningCopy(REPORT_FAILED_WARNING, "Hearth")).toBe("Couldn't save your progress to Hearth. Playback continues.");
    expect(reportingWarningCopy("The stopped report did not finish before the shutdown deadline.", "Hearth")).toContain("shutdown deadline");
  });
});
