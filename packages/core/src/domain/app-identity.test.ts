import { describe, expect, it } from "vitest";
import { ANDROID_APPLICATION_ID, APP_NAME } from "./app-identity";

describe("app identity", () => {
  it("names the product Octave", () => {
    expect(APP_NAME).toBe("Octave");
  });

  it("uses the placeholder Android application ID, in a form Android accepts", () => {
    expect(ANDROID_APPLICATION_ID).toBe("dev.octave.tv");
    // Two or more segments, each starting with a letter (Android's applicationId rules).
    expect(ANDROID_APPLICATION_ID).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/);
  });
});
