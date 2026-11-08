import { describe, expect, it } from "vitest";
import { REFUSAL_COPY } from "./refusal-copy";

function textOf(reason: keyof typeof REFUSAL_COPY): string {
  const copy = REFUSAL_COPY[reason];
  return `${copy.title} ${copy.explanation} ${copy.whatYouCanDo}`;
}

describe("refusal copy", () => {
  it("has copy for exactly the reasons that remain refusals", () => {
    expect(Object.keys(REFUSAL_COPY).sort()).toEqual([
      "conversion-not-allowed",
      "disc-source",
      "iso-source",
      "live-source",
      "missing-source-data",
      "no-sources",
      "not-a-file",
      "unsafe-transcoding-url",
    ]);
  });

  // Conversion is the fallback now: no copy may promise it or refuse it on
  // Fluster's behalf. Only conversion-not-allowed may name the admin settings.
  it.each(Object.entries(REFUSAL_COPY))("%s has plain copy and does not refuse conversion for Fluster", (_reason, copy) => {
    expect(copy.title.trim()).not.toBe("");
    expect(copy.explanation.trim()).not.toBe("");
    expect(copy.whatYouCanDo.trim()).not.toBe("");
    const text = `${copy.title} ${copy.explanation} ${copy.whatYouCanDo}`.toLowerCase();
    expect(text).not.toMatch(/transcode anyway|play anyway|convert anyway/);
    expect(text).not.toMatch(/won.t ask the server|will not ask the server|never ask the server|direct.play only/);
  });

  it.each(Object.keys(REFUSAL_COPY).filter((reason) => reason !== "conversion-not-allowed"))(
    "%s does not name the transcoding or remuxing settings",
    (reason) => {
      expect(textOf(reason as keyof typeof REFUSAL_COPY).toLowerCase()).not.toMatch(/transcod|remux/);
    },
  );

  it("conversion-not-allowed names the three Jellyfin admin settings with their dashboard labels", () => {
    const copy = REFUSAL_COPY["conversion-not-allowed"];
    expect(copy.whatYouCanDo).toContain("Allow video playback that requires transcoding");
    expect(copy.whatYouCanDo).toContain("Allow audio playback that requires transcoding");
    expect(copy.whatYouCanDo).toContain("Allow video playback that requires conversion without re-encoding");
    expect(copy.whatYouCanDo).toMatch(/Retry/);
  });

  it("tells disc owners to rip an MKV", () => {
    expect(REFUSAL_COPY["disc-source"].whatYouCanDo).toMatch(/MKV/);
  });
});
