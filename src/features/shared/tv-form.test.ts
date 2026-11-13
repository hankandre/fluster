import { afterEach, describe, expect, it } from "vitest";
import { applyFormFlag, isTvForm } from "./tv-form";

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

describe("applyFormFlag", () => {
  it("sets the TV form for ?form=tv", () => {
    applyFormFlag("?form=tv", document.documentElement);
    expect(isTvForm()).toBe(true);
  });

  it("ignores other values and no query", () => {
    for (const search of ["", "?form=desktop", "?form=TV", "?x=1"]) applyFormFlag(search, document.documentElement);
    expect(isTvForm()).toBe(false);
  });

  it("never removes an attribute that is already set", () => {
    document.documentElement.dataset.form = "tv";
    applyFormFlag("", document.documentElement);
    expect(isTvForm()).toBe(true);
  });
});
