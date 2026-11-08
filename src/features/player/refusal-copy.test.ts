import { describe, expect, it } from "vitest";
import { REFUSAL_COPY } from "./refusal-copy";

describe("refusal copy", () => {
  it.each(Object.entries(REFUSAL_COPY))("%s has plain copy and never offers conversion", (_reason, copy) => {
    expect(copy.title.trim()).not.toBe("");
    expect(copy.explanation.trim()).not.toBe("");
    expect(copy.whatYouCanDo.trim()).not.toBe("");
    const text = `${copy.title} ${copy.explanation} ${copy.whatYouCanDo}`.toLowerCase();
    expect(text).not.toMatch(/transcode anyway|play anyway|convert anyway/);
    expect(text).not.toMatch(/transcod|remux/);
  });

  it("explains the server policy behind no-direct-play", () => {
    const copy = REFUSAL_COPY["no-direct-play"];
    expect(copy.explanation).toMatch(/bitrate limit/);
    expect(copy.whatYouCanDo).toMatch(/admin/);
  });

  it("tells disc owners to rip an MKV", () => {
    expect(REFUSAL_COPY["disc-source"].whatYouCanDo).toMatch(/MKV/);
  });
});
