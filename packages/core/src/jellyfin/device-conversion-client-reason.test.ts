import { describe, expect, it } from "vitest";
import type { PlaybackPlan } from "../domain/playback";
import { confirmedPlan } from "../player/confirm-play-method";
import { EVERYTHING, negotiate, recorded, VERSIONS, withoutH264 } from "./device-test-support";

// T2-07 item 5, the two cases the frozen item 5 tests leave out: confirmedPlan keeps the client-side reason, and a
// server TranscodingUrl that names DeviceCannotPlay does not set it.
function planOf(result: unknown): PlaybackPlan {
  if (result instanceof Error) throw result;
  return result as PlaybackPlan;
}

const SERVER_RAN = { videoDirect: false, audioDirect: false, reasons: [] } as const;

describe.each(VERSIONS)("T2-07 item 5: confirming the plan against Jellyfin %s", (version) => {
  it("keeps clientConversionReason on the confirmed plan", async () => {
    const { result } = await negotiate("item-h264", [recorded(version, "conversion-h264"), recorded(version, "device-conversion-h264")], withoutH264);
    const plan = planOf(result);
    expect(plan.delivery === "hls" && plan.clientConversionReason).toBe("DeviceCannotPlay");
    for (const server of [SERVER_RAN, { videoDirect: true, audioDirect: true, reasons: ["DirectPlayError"] as const }]) {
      expect(confirmedPlan(plan, server)).toMatchObject({ clientConversionReason: "DeviceCannotPlay" });
    }
  });

  it("does not set it from a TranscodingUrl that names DeviceCannotPlay", async () => {
    const answer = recorded(version, "conversion-h264-limited");
    for (const source of answer.MediaSources ?? []) {
      if (source.TranscodingUrl) source.TranscodingUrl = source.TranscodingUrl.replace(/TranscodeReasons=[^&]*/i, "TranscodeReasons=DeviceCannotPlay");
    }
    const plan = planOf((await negotiate("item-h264", [answer], EVERYTHING)).result);
    expect(plan.delivery).toBe("hls");
    expect(plan).not.toHaveProperty("clientConversionReason");
    expect(plan.conversionReasons).not.toContain("DeviceCannotPlay");
    expect(confirmedPlan(plan, SERVER_RAN)).not.toHaveProperty("clientConversionReason");
  });
});
