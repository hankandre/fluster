import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailHeader } from "./detail-header";

vi.mock("../../home/blurhash", () => ({ blurhashToDataUrl: () => undefined }));

afterEach(cleanup);

function renderHeader(props: Partial<Parameters<typeof DetailHeader>[0]> = {}) {
  return render(
    <main>
      <DetailHeader title="Arrival" facts="2016 · 1 h 57 min" actions={<a href="#/play" data-roving-item="">Play</a>} {...props} />
    </main>,
  );
}

describe("DetailHeader", () => {
  it("makes the Logo an image named by the title inside the h1", () => {
    renderHeader({ logo: { src: "https://media.test/logo.png" } });
    const heading = screen.getByRole("heading", { level: 1 });
    expect(within(heading).getByRole("img", { name: "Arrival" })).toHaveAttribute("src", "https://media.test/logo.png");
  });

  it("falls back to the title as text when the Logo fails", () => {
    renderHeader({ logo: { src: "https://media.test/logo.png" } });
    fireEvent.error(screen.getByRole("img", { name: "Arrival" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Arrival" })).toBeInTheDocument();
  });

  it("links the series, or shows its name as text without a link", () => {
    const { unmount } = renderHeader({ seriesLink: { name: "Harbor Lights", href: "#/next/series/s1" } });
    expect(screen.getByRole("link", { name: "Harbor Lights" })).toHaveAttribute("href", "#/next/series/s1");
    unmount();
    renderHeader({ seriesLink: { name: "Harbor Lights" } });
    expect(screen.queryByRole("link", { name: "Harbor Lights" })).toBeNull();
    expect(screen.getByText("Harbor Lights")).toBeInTheDocument();
  });

  it("moves from the series link Down to the next spatial row", () => {
    render(
      <main>
        <DetailHeader title="Ep" seriesLink={{ name: "Show", href: "#/s" }} actions={<div data-spatial-row=""><a href="#/p" data-roving-item="">Play</a></div>} />
      </main>,
    );
    const link = screen.getByRole("link", { name: "Show" });
    link.focus();
    fireEvent.keyDown(link, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Play" })).toHaveFocus();
  });

  it("shows facts, badges, and the overview, and marks the header busy", () => {
    renderHeader({ badges: <ul><li>4K</li></ul>, overview: <p>Linguist.</p>, busy: true });
    expect(screen.getByText("2016 · 1 h 57 min")).toBeInTheDocument();
    expect(screen.getByText("4K")).toBeInTheDocument();
    expect(screen.getByText("Linguist.")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("aria-busy", "true");
  });
});
