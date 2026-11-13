import { describe, expectTypeOf, it } from "vitest";
import type { PlaybackPlan } from "./playback";

describe("PlaybackPlan", () => {
  it("has no authorization field, so nothing the UI holds can carry the header", () => {
    expectTypeOf<PlaybackPlan>().not.toHaveProperty("authorization");
    expectTypeOf<keyof PlaybackPlan>().not.toEqualTypeOf<"authorization">();
  });
});
