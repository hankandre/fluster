import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artTint } from "../art-tint";
import { Hero, type HeroProps } from "./hero";

vi.mock("../../home/blurhash", () => ({
  blurhashToDataUrl: (hash: string) => `data:image/png;base64,${hash}`,
}));

afterEach(cleanup);

const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

function renderHero(props: Partial<HeroProps> = {}) {
  return render(
    <main>
      <Hero
        title="Arrival"
        facts="2016 · 1 h 56 min"
        overview="A linguist decodes an alien language."
        primary={{ label: "Play", href: "#/next/play/m1", onActivate: vi.fn() }}
        moreInfoHref="#/next/item/m1"
        {...props}
      />
    </main>,
  );
}

describe("Hero title", () => {
  it("shows the Logo as an image named by the title inside the heading", () => {
    renderHero({ logo: { src: "https://media.test/logo.png" } });
    const heading = screen.getByRole("heading", { level: 2 });
    const logo = within(heading).getByRole("img", { name: "Arrival" });
    expect(logo).toHaveAttribute("src", "https://media.test/logo.png");
  });

  it("shows the title as text without a Logo, and when the Logo fails to load", () => {
    const { unmount } = renderHero();
    expect(screen.getByRole("heading", { level: 2, name: "Arrival" })).toHaveTextContent("Arrival");
    unmount();
    renderHero({ logo: { src: "https://media.test/logo.png" } });
    fireEvent.error(screen.getByRole("img", { name: "Arrival" }));
    expect(screen.queryByRole("img", { name: "Arrival" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Arrival");
  });

  it("is a region named by the title", () => {
    renderHero();
    expect(screen.getByRole("region", { name: "Arrival" })).toBeInTheDocument();
  });
});

describe("Hero text and actions", () => {
  it("renders the facts and overview, and skeletons while the detail is pending", () => {
    const { container, rerender } = renderHero();
    expect(screen.getByText("2016 · 1 h 56 min")).toBeInTheDocument();
    expect(screen.getByText("A linguist decodes an alien language.")).toBeInTheDocument();
    rerender(
      <main>
        <Hero title="Arrival" detailPending primary={{ label: "Play", href: "#/p", onActivate: vi.fn() }} moreInfoHref="#/i" />
      </main>,
    );
    expect(screen.queryByText("2016 · 1 h 56 min")).toBeNull();
    expect(container.querySelectorAll('.ui-skeleton[data-shape="line"]')).toHaveLength(2);
  });

  it("links the primary action and More info", () => {
    renderHero();
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1");
    expect(screen.getByRole("link", { name: "More info" })).toHaveAttribute("href", "#/next/item/m1");
  });

  it("calls the primary action's handler on click", () => {
    const onActivate = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    renderHero({ primary: { label: "Play", href: "#/next/play/m1", onActivate } });
    fireEvent.click(screen.getByRole("link", { name: "Play" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("shows a progress ring on the primary action only when progress is set", () => {
    const { container, rerender } = renderHero();
    expect(container.querySelector(".ui-progress-ring")).toBeNull();
    rerender(
      <main>
        <Hero title="Arrival" primary={{ label: "Resume from 12:34", href: "#/p", onActivate: vi.fn(), progress: 0.4 }} />
      </main>,
    );
    expect(screen.getByRole("link", { name: "Resume from 12:34" }).querySelector(".ui-progress-ring")).not.toBeNull();
  });

  it("makes More info the primary button when there is no primary action", () => {
    renderHero({ primary: undefined });
    expect(screen.queryByRole("link", { name: "Play" })).toBeNull();
    expect(screen.getByRole("link", { name: "More info" })).toHaveClass("ui-button--primary");
  });

  it("moves between the actions with Left and Right", () => {
    renderHero();
    const play = screen.getByRole("link", { name: "Play" });
    const more = screen.getByRole("link", { name: "More info" });
    play.focus();
    fireEvent.keyDown(play, { key: "ArrowRight" });
    expect(more).toHaveFocus();
    fireEvent.keyDown(more, { key: "ArrowLeft" });
    expect(play).toHaveFocus();
  });
});

describe("Hero frame", () => {
  it("renders a busy frame with no actions while pending", () => {
    const { container } = renderHero({ pending: true });
    expect(container.querySelector(".hero")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelectorAll(".ui-skeleton").length).toBeGreaterThan(0);
  });

  it("sets the art tint inline from the BlurHash", () => {
    const { container } = renderHero({ art: { src: "https://media.test/art.jpg", blurHash: HASH } });
    const hero = container.querySelector<HTMLElement>(".hero");
    expect(hero?.style.getPropertyValue("--art-accent")).toBe(artTint(HASH).accent);
    expect(container.querySelector(".hero-art img")).toHaveAttribute("src", "https://media.test/art.jpg");
  });
});

describe("Hero TV form", () => {
  afterEach(() => {
    delete document.documentElement.dataset.form;
    window.location.hash = "";
  });

  it("Menu or i on the primary opens More info; Enter is left to the link", () => {
    renderHero();
    const primary = screen.getByRole("link", { name: "Play" });
    expect(primary).toHaveAttribute("aria-keyshortcuts", "i");
    expect(fireEvent.keyDown(primary, { key: "Enter" })).toBe(true);
    expect(window.location.hash).toBe("");
    expect(fireEvent.keyDown(primary, { key: "ContextMenu" })).toBe(false);
    expect(window.location.hash).toBe("#/next/item/m1");
  });

  it("focuses the primary action on mount in the TV form only", () => {
    const { unmount } = renderHero();
    expect(screen.getByRole("link", { name: "Play" })).not.toHaveFocus();
    unmount();
    document.documentElement.dataset.form = "tv";
    renderHero();
    expect(screen.getByRole("link", { name: "Play" })).toHaveFocus();
  });
});
