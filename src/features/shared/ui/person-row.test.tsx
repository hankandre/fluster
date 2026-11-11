import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initials, PersonRow } from "./person-row";

afterEach(cleanup);

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Amy Adams")).toBe("AA");
    expect(initials("Jeremy Renner Jr")).toBe("JJ");
    expect(initials("  forest   whitaker ")).toBe("FW");
  });

  it("handles a single word and an empty name", () => {
    expect(initials("Cher")).toBe("C");
    expect(initials("   ")).toBe("");
  });
});

describe("PersonRow", () => {
  it("lists names and plain roles under a Cast heading, with no links or buttons", () => {
    render(<PersonRow people={[{ name: "Amy Adams", role: "Louise" }, { name: "Cher" }]} />);
    const region = screen.getByRole("region", { name: "Cast" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByText("Louise")).toBeInTheDocument();
    expect(within(region).queryByRole("link")).toBeNull();
    expect(within(region).queryByRole("button")).toBeNull();
  });

  it("renders nothing without people", () => {
    const { container } = render(<PersonRow people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
