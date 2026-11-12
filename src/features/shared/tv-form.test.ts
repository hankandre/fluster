import { afterEach, describe, expect, it } from "vitest";
import { isTvForm } from "./tv-form";

afterEach(() => {
  delete document.documentElement.dataset.form;
});

describe("isTvForm", () => {
  it("is false by default, true with data-form=tv, and false again once removed", () => {
    expect(isTvForm()).toBe(false);
    document.documentElement.dataset.form = "tv";
    expect(isTvForm()).toBe(true);
    delete document.documentElement.dataset.form;
    expect(isTvForm()).toBe(false);
  });

  it("is false for another form value", () => {
    document.documentElement.dataset.form = "desktop";
    expect(isTvForm()).toBe(false);
  });
});
