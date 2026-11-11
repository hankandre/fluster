import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionBar } from "./action-bar";

afterEach(cleanup);

describe("ActionBar", () => {
  function setup() {
    render(
      <main>
        <ActionBar>
          <a href="#/play" data-roving-item="">Play</a>
          <button type="button" data-roving-item="">Watched</button>
        </ActionBar>
        <ul data-spatial-row="">
          <li><a href="#/e1" data-roving-item="">Episode 1</a></li>
        </ul>
      </main>,
    );
  }

  it("is a named group that moves with Left and Right", () => {
    setup();
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    const play = screen.getByRole("link", { name: "Play" });
    play.focus();
    fireEvent.keyDown(play, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Watched" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Watched" }), { key: "ArrowLeft" });
    expect(play).toHaveFocus();
  });

  it("moves Down to the next spatial row", () => {
    setup();
    const play = screen.getByRole("link", { name: "Play" });
    play.focus();
    fireEvent.keyDown(play, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Episode 1" })).toHaveFocus();
  });
});
