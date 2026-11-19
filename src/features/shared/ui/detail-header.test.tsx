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

  it("renders genres with a link as links in one spatial row after the facts", () => {
    renderHeader({ genres: [{ name: "Drama", href: "#/next/browse/lib-1?genre=g1" }, { name: "Mystery" }] });
    const line = screen.getByText(/2016 · 1 h 57 min ·/).closest("p")!;
    expect(line).toHaveAttribute("data-spatial-row");
    expect(line.textContent).toBe("2016 · 1 h 57 min · Drama · Mystery");
    expect(within(line).getByRole("link", { name: "Drama" })).toHaveAttribute("href", "#/next/browse/lib-1?genre=g1");
    expect(within(line).queryByRole("link", { name: "Mystery" })).toBeNull();
  });

  it("moves between genre links with Left and Right and up to the next row with Down", () => {
    renderHeader({ genres: [{ name: "Drama", href: "#/a" }, { name: "Mystery", href: "#/b" }], actions: <div data-spatial-row=""><a href="#/play" data-roving-item="">Play</a></div> });
    const [drama, mystery] = [screen.getByRole("link", { name: "Drama" }), screen.getByRole("link", { name: "Mystery" })];
    drama.focus();
    fireEvent.keyDown(drama, { key: "ArrowRight" });
    expect(mystery).toHaveFocus();
    fireEvent.keyDown(mystery, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Play" })).toHaveFocus();
  });

  it("keeps the genre links out of the Tab order", () => {
    renderHeader({ genres: [{ name: "Drama", href: "#/a" }, { name: "Mystery", href: "#/b" }] });
    expect(screen.getByRole("link", { name: "Drama" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("link", { name: "Mystery" })).toHaveAttribute("tabindex", "-1");
  });

  it("joins genres without links into the facts text", () => {
    renderHeader({ genres: [{ name: "Drama" }, { name: "Mystery" }] });
    expect(screen.getByText("2016 · 1 h 57 min · Drama · Mystery")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Drama" })).toBeNull();
  });

  it("shows genres alone when there are no facts", () => {
    renderHeader({ facts: undefined, genres: [{ name: "Drama", href: "#/a" }] });
    expect(screen.getByRole("link", { name: "Drama" }).closest("p")?.textContent).toBe("Drama");
  });

  it("shows facts, badges, and the overview, and marks the header busy", () => {
    renderHeader({ badges: <ul><li>4K</li></ul>, overview: <p>Linguist.</p>, busy: true });
    expect(screen.getByText("2016 · 1 h 57 min")).toBeInTheDocument();
    expect(screen.getByText("4K")).toBeInTheDocument();
    expect(screen.getByText("Linguist.")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("aria-busy", "true");
  });
});
