import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("shows the picture over the initials, and initials alone without one", () => {
    const { container } = render(<PersonRow people={[{ name: "Amy Adams", imageSrc: "http://x/a.jpg" }, { name: "Cher" }]} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "http://x/a.jpg");
    expect(images[0]).toHaveAttribute("alt", "");
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("falls back to the initials when the picture fails", () => {
    const { container } = render(<PersonRow people={[{ name: "Amy Adams", imageSrc: "http://x/a.jpg" }]} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows initials while the picture loads, removes them once it loads, and brings them back on error", () => {
    const { container, rerender } = render(<PersonRow people={[{ name: "Amy Adams", imageSrc: "http://x/a.jpg" }]} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    fireEvent.load(container.querySelector("img")!);
    expect(screen.queryByText("AA")).toBeNull();
    expect(container.querySelector(".ui-person-disc")).toHaveTextContent("");
    expect(container.querySelector("img")).not.toBeNull();
    rerender(<PersonRow people={[{ name: "Bo Cole", imageSrc: "http://x/b.jpg" }]} />);
    expect(screen.getByText("BC")).toBeInTheDocument();
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("BC")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing without people", () => {
    const { container } = render(<PersonRow people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
