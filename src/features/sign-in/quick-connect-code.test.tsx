import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { groupCode, QuickConnectCode } from "./quick-connect-code";

afterEach(cleanup);

describe("groupCode", () => {
  it.each([
    ["482913", ["482", "913"]],
    ["1234", ["12", "34"]],
    ["1234567", ["123", "456", "7"]],
    ["12345", ["123", "45"]],
    ["123", ["123"]],
    ["7", ["7"]],
    ["", []],
  ])("splits %j", (code, groups) => {
    expect(groupCode(code)).toEqual(groups);
  });
});

describe("QuickConnectCode", () => {
  it("draws each group in its own span and keeps the bare code as text", () => {
    const { container } = render(<QuickConnectCode code="482913" />);
    const code = screen.getByLabelText("Quick Connect code");
    expect(code).toHaveTextContent(/^482913$/);
    expect(code.textContent).toBe("482913");
    expect(container.querySelectorAll(".sign-in-code-group")).toHaveLength(2);
    expect(code).toHaveAttribute("data-testid", "quick-connect-code");
  });

  it("shows a busy placeholder before the code arrives, without nesting a div in a paragraph", () => {
    const { container } = render(<QuickConnectCode code="" />);
    const code = screen.getByLabelText("Quick Connect code");
    expect(code).toHaveAttribute("aria-busy", "true");
    expect(code.tagName).toBe("DIV");
    expect(container.querySelector("p .ui-skeleton")).toBeNull();
  });
});
