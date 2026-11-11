import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaBadges } from "./media-badges";

afterEach(cleanup);

describe("MediaBadges", () => {
  it("renders a named list of the badges", () => {
    render(<MediaBadges badges={["4K", "Dolby Vision"]} />);
    const list = screen.getByRole("list", { name: "Media badges" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["4K", "Dolby Vision"]);
  });

  it("renders nothing without badges", () => {
    const { container } = render(<MediaBadges badges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
