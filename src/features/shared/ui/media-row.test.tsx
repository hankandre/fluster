import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaRow } from "./media-row";

vi.mock("../../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const items = [
  { id: "a", variant: "poster" as const, title: "Alpha", href: "#/a" },
  { id: "b", variant: "poster" as const, title: "Beta", href: "#/b" },
  { id: "c", variant: "poster" as const, title: "Gamma", href: "#/c" },
];

describe("MediaRow", () => {
  it("names the section by its heading", () => {
    render(<MediaRow title="Latest" variant="poster" status="ready" items={items} />);
    expect(screen.getByRole("region", { name: "Latest" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Latest" })).toBeInTheDocument();
  });

  it("shows poster skeletons while pending", () => {
    render(<MediaRow title="Latest" variant="poster" status="pending" />);
    const skeletons = screen.getAllByTestId("card-skeleton");
    expect(skeletons).toHaveLength(8);
    expect(skeletons[0]).toHaveAttribute("data-variant", "poster");
    expect(skeletons[0].firstElementChild).toHaveStyle({ aspectRatio: "2 / 3" });
    expect(screen.getByRole("region", { name: "Latest", busy: true })).toBeInTheDocument();
  });

  it("shows thumb skeletons at 16 / 9", () => {
    render(<MediaRow title="Next Up" variant="thumb" status="pending" />);
    const skeletons = screen.getAllByTestId("card-skeleton");
    expect(skeletons).toHaveLength(5);
    expect(skeletons[0]).toHaveAttribute("data-variant", "thumb");
    expect(skeletons[0].firstElementChild).toHaveStyle({ aspectRatio: "16 / 9" });
  });

  it("uses a line skeleton and the label when it has no title yet", () => {
    const { container } = render(<MediaRow label="Latest" variant="poster" status="pending" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("region", { name: "Latest", busy: true })).toBeInTheDocument();
    expect(container.querySelector('.ui-skeleton[data-shape="line"]')).not.toBeNull();
  });

  it("shows an inline error with Retry", () => {
    const onRetry = vi.fn();
    render(<MediaRow title="Next Up" variant="thumb" status="error" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load Next Up.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for an empty ready list", () => {
    const { container } = render(<MediaRow title="Latest" variant="poster" status="ready" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is one Tab stop and moves with the arrow keys", () => {
    render(<MediaRow title="Latest" variant="poster" status="ready" items={items} />);
    const stops = () => screen.getAllByRole("link").filter((link) => link.getAttribute("tabindex") === "0");
    expect(stops()).toHaveLength(1);
    const first = screen.getByRole("link", { name: "Alpha" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Beta" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(first).toHaveFocus();
  });

  it("scrolls a focused card into view without centring it", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<MediaRow title="Latest" variant="poster" status="ready" items={items} />);
    screen.getByRole("link", { name: "Beta" }).focus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  });

  it("keeps the row heading in view when a card takes focus", () => {
    const scrolled: Element[] = [];
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value(this: Element) {
        scrolled.push(this);
      },
    });
    render(<MediaRow title="Latest" variant="poster" status="ready" items={items} />);
    screen.getByRole("link", { name: "Beta" }).focus();
    const row = screen.getByRole("region", { name: "Latest" });
    expect(scrolled).toContain(row);
    expect(row).toContainElement(screen.getByRole("heading", { name: "Latest" }));
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  });

  it("pages with hidden, untabbable buttons that scroll the list", () => {
    const widths = vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(2000);
    const client = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(500);
    const scrollBy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
    render(<MediaRow title="Latest" variant="poster" status="ready" items={items} />);
    const next = screen.getByLabelText("Next");
    expect(next).toHaveAttribute("tabindex", "-1");
    expect(next).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByLabelText("Previous")).toBeNull();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
    widths.mockRestore();
    client.mockRestore();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollBy;
  });
});
