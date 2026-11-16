import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { SubtitleInfo } from "../../domain/catalog";
import { ActionBar } from "../shared/ui";
import { SubtitleList } from "./subtitle-list";

afterEach(cleanup);

function track(language: string | undefined, flags: Partial<SubtitleInfo> = {}): SubtitleInfo {
  return { ...(language === undefined ? {} : { language }), codec: "subrip", isExternal: false, isDefault: false, isForced: false, ...flags };
}

const mixed = [track("eng", { isDefault: true }), track("fra"), track("fra", { isForced: true }), track("spa")];

describe("SubtitleList", () => {
  it("renders None for no tracks, with no row", () => {
    const { container } = render(<SubtitleList subtitles={[]} preference={undefined} cultures={undefined} />);
    expect(container).toHaveTextContent("None");
    expect(container.querySelector("[data-spatial-row]")).toBeNull();
  });

  it("lists the viewer's language, then the button", () => {
    render(<SubtitleList subtitles={mixed} preference="fra" cultures={undefined} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("French · SRT")).toBeInTheDocument();
    expect(screen.getByText("French · SRT · forced")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 4 subtitles" })).toBeInTheDocument();
  });

  it("lists the default track, a count line, and the button without a preference", () => {
    render(<SubtitleList subtitles={mixed} preference={undefined} cultures={undefined} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("3 more in 2 languages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 4 subtitles" })).toBeInTheDocument();
  });

  it("shows only the count line when there is no default track", () => {
    render(<SubtitleList subtitles={[track("fra"), track("spa"), track("deu")]} preference={undefined} cultures={undefined} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("3 in 3 languages")).toBeInTheDocument();
  });

  it.each([
    ["the default", track("eng", { isDefault: true }), undefined],
    ["a match", track("eng"), "eng"],
    ["neither", track("fra"), "eng"],
  ])("lists a one-track version directly (%s): no row, no line, no button", (_name, only, preference) => {
    const { container } = render(<SubtitleList subtitles={[only]} preference={preference} cultures={undefined} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[data-spatial-row]")).toBeNull();
    expect(container.querySelector(".subtitle-count")).toBeNull();
  });

  it("puts the button in a spatial row as a roving item", () => {
    render(<SubtitleList subtitles={mixed} preference={undefined} cultures={undefined} />);
    const button = screen.getByRole("button", { name: "Show all 4 subtitles" });
    expect(button).toHaveAttribute("data-roving-item");
    expect(button.closest("[data-spatial-row]")).not.toBeNull();
  });

  function renderBelowActions() {
    return render(
      <main>
        <ActionBar>
          <a href="#/play" data-roving-item="">Play</a>
        </ActionBar>
        <SubtitleList subtitles={mixed} preference={undefined} cultures={undefined} />
      </main>,
    );
  }

  it("is reached with ArrowDown, expanded with Enter, and left with ArrowUp", async () => {
    renderBelowActions();
    const play = screen.getByRole("link", { name: "Play" });
    play.focus();
    fireEvent.keyDown(play, { key: "ArrowDown" });
    const button = screen.getByRole("button", { name: "Show all 4 subtitles" });
    expect(button).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    const list = screen.getByRole("list", { name: "All 4 subtitles" });
    expect(list.querySelectorAll("li")).toHaveLength(4);
    expect(screen.queryByText("3 more in 2 languages")).toBeNull();
    expect(screen.getByRole("button", { name: "Show fewer subtitles" })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(play).toHaveFocus();
  });

  it("toggles in place: label, aria-expanded, aria-controls, and focus stay on the button", async () => {
    render(<SubtitleList subtitles={mixed} preference={undefined} cultures={undefined} />);
    const more = screen.getByRole("button", { name: "Show all 4 subtitles" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.focus();

    await userEvent.keyboard("{Enter}");
    const fewer = screen.getByRole("button", { name: "Show fewer subtitles" });
    expect(fewer).toBe(more);
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    expect(fewer).toHaveFocus();
    const list = screen.getByRole("list", { name: "All 4 subtitles" });
    expect(list).toHaveAttribute("id", fewer.getAttribute("aria-controls"));
    expect(list).not.toHaveAttribute("tabindex");
    expect(list.compareDocumentPosition(fewer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.keyboard("{Enter}");
    const again = screen.getByRole("button", { name: "Show all 4 subtitles" });
    expect(again).toHaveAttribute("aria-expanded", "false");
    expect(again).toHaveFocus();
    expect(screen.queryByRole("list", { name: "All 4 subtitles" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("3 more in 2 languages")).toBeInTheDocument();
    expect(document.getElementById(again.getAttribute("aria-controls") ?? "")).not.toBeNull();
  });

  it("goes back to the short form for another version", () => {
    const { rerender } = render(<SubtitleList key="a" subtitles={mixed} preference={undefined} cultures={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all 4 subtitles" }));
    expect(screen.getByRole("list", { name: "All 4 subtitles" })).toBeInTheDocument();
    rerender(<SubtitleList key="b" subtitles={mixed} preference={undefined} cultures={undefined} />);
    expect(screen.getByRole("button", { name: "Show all 4 subtitles" })).toBeInTheDocument();
  });
});
