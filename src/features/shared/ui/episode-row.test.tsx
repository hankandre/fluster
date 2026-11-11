import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeList, EpisodeRow, type EpisodeRowProps } from "./episode-row";
import { cardAccessibleName } from "./media-card";

const TICKS_PER_MINUTE = 600_000_000;

const keeper: EpisodeRowProps = {
  title: "The Keeper's Log",
  number: 2,
  subtitle: "Episode 2",
  runtime: "45 min",
  remainingTicks: 23 * TICKS_PER_MINUTE,
  progress: 0.49,
  overview: "A journal washes ashore.",
  href: "#/next/play/ep-2?start=1",
  detailsHref: "#/next/item/ep-2",
};

function renderRow(props: Partial<EpisodeRowProps> = {}) {
  render(<ul><EpisodeRow {...keeper} {...props} /></ul>);
}

beforeEach(() => {
  window.location.hash = "#/next/series/s1";
});

afterEach(cleanup);

describe("EpisodeRow", () => {
  it("shows the number and title, the time left, and the overview", () => {
    renderRow();
    expect(document.querySelector(".ui-episode-row-title")).toHaveTextContent("2 · The Keeper's Log");
    expect(screen.getByText("23 min left")).toBeInTheDocument();
    expect(screen.queryByText("45 min")).not.toBeInTheDocument();
    expect(screen.getByText("A journal washes ashore.")).toBeInTheDocument();
    expect(screen.getByTestId("card-progress")).toBeInTheDocument();
  });

  it("shows the runtime when the episode is not part-watched, and the title alone without a number", () => {
    renderRow({ progress: undefined, remainingTicks: undefined, number: undefined });
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(document.querySelector(".ui-episode-row-title")).toHaveTextContent(/^The Keeper's Log$/);
  });

  it("names the link by the card rule and describes it by the meta line and overview", () => {
    renderRow();
    const link = screen.getByRole("link", { name: "The Keeper's Log, Episode 2, 23 minutes left" });
    expect(cardAccessibleName(keeper)).toBe("The Keeper's Log, Episode 2, 23 minutes left");
    expect(link).toHaveAttribute("href", "#/next/play/ep-2?start=1");
    expect(link).toHaveAccessibleDescription("23 min left A journal washes ashore.");
  });

  it("marks a played episode with a check and says watched in its name", () => {
    renderRow({ played: true, progress: undefined, remainingTicks: undefined });
    expect(screen.getByRole("link", { name: "The Keeper's Log, Episode 2, watched" })).toBeInTheDocument();
    expect(document.querySelector(".media-card-mark svg")).not.toBeNull();
  });

  it("leaves a missing meta line and overview out of the description", () => {
    renderRow({ runtime: undefined, progress: undefined, remainingTicks: undefined, overview: undefined });
    expect(screen.getByRole("link", { name: "The Keeper's Log, Episode 2" })).not.toHaveAttribute("aria-describedby");
  });

  it("has a Details link and opens it with i, the Menu key, and right-click", () => {
    renderRow();
    expect(screen.getByRole("link", { name: "Details for The Keeper's Log" })).toHaveAttribute("href", "#/next/item/ep-2");
    const link = screen.getByRole("link", { name: /^The Keeper's Log, Episode 2/ });
    expect(link).toHaveAttribute("aria-keyshortcuts", "i");
    for (const fire of [
      () => fireEvent.keyDown(link, { key: "i" }),
      () => fireEvent.keyDown(link, { key: "ContextMenu" }),
      () => fireEvent.contextMenu(link),
    ]) {
      window.location.hash = "#/next/series/s1";
      fire();
      expect(window.location.hash).toBe("#/next/item/ep-2");
    }
  });

  it("calls onActivate on a click and nests no interactive element in the play link", () => {
    const onActivate = vi.fn((event: React.MouseEvent) => event.preventDefault());
    renderRow({ onActivate });
    const link = screen.getByRole("link", { name: /^The Keeper's Log, Episode 2/ });
    fireEvent.click(screen.getByText("A journal washes ashore."));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(link.querySelector("a, button, input, select")).toBeNull();
  });
});

describe("EpisodeList", () => {
  function List() {
    return (
      <main>
        <EpisodeList label="Season 1 episodes">
          <EpisodeRow {...keeper} title="First" href="#/play/1" detailsHref="#/item/1" />
          <EpisodeRow {...keeper} title="Second" href="#/play/2" detailsHref="#/item/2" />
        </EpisodeList>
      </main>
    );
  }

  it("is one Tab stop and moves Down, Up, and Right between play and Details links", () => {
    render(<List />);
    const list = screen.getByRole("list", { name: "Season 1 episodes" });
    expect(Array.from(list.querySelectorAll("[tabindex='0']"))).toHaveLength(1);

    const first = screen.getByRole("link", { name: /^First, / });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = screen.getByRole("link", { name: /^Second, / });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("link", { name: "Details for First" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Details for Second" })).toHaveFocus();
  });
});
