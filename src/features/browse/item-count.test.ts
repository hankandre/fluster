import { describe, expect, it } from "vitest";
import { itemCountLabel } from "./item-count";

describe("itemCountLabel", () => {
  it("pluralises and groups digits", () => {
    expect(itemCountLabel(1)).toBe("1 item");
    expect(itemCountLabel(0)).toBe("0 items");
    expect(itemCountLabel(248)).toBe("248 items");
    expect(itemCountLabel(1248)).toBe(`${new Intl.NumberFormat().format(1248)} items`);
  });
});
