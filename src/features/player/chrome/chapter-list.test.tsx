import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChapterList } from "./chapter-list";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--chapter-thumb-w");
});

const chapters = [
  { startSeconds: 0, name: "Opening" },
  { startSeconds: 65, name: "Contact" },
  { startSeconds: 3723, name: "Finale" },
];

function setup(overrides: Partial<Parameters<typeof ChapterList>[0]> = {}) {
  const onSeek = vi.fn();
  const onClose = vi.fn();
  render(
    <ChapterList chapters={chapters} positionSeconds={70} durationSeconds={4000} onSeek={onSeek} onClose={onClose} {...overrides} />,
  );
  return { onSeek, onClose };
}

describe("ChapterList", () => {
  it("lists every chapter with its name and start time, in a Chapters region", () => {
    setup();
    expect(screen.getByRole("region", { name: "Chapters" })).toBeInTheDocument();
    const rows = screen.getAllByRole("option");
    expect(rows.map((row) => row.textContent)).toEqual(["Opening0:00", "Contact1:05", "Finale1:02:03"]);
  });

  it("marks the chapter playing now and puts focus on it", () => {
    setup();
    expect(screen.getAllByRole("option").map((row) => row.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(screen.getByRole("option", { name: /Contact/ })).toHaveFocus();
  });

  it("marks no chapter before the first one", () => {
    setup({ chapters: [{ startSeconds: 30, name: "Late" }, { startSeconds: 90, name: "Later" }], positionSeconds: 5 });
    expect(screen.getAllByRole("option").every((row) => row.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("seeks to the start and closes on Enter and on Space", () => {
    const { onSeek, onClose } = setup();
    fireEvent.keyDown(screen.getByRole("option", { name: /Contact/ }), { key: "Enter" });
    expect(onSeek).toHaveBeenLastCalledWith(65);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("option", { name: /Finale/ }), { key: " " });
    expect(onSeek).toHaveBeenLastCalledWith(3723);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("clamps a start past the end of the file", () => {
    const { onSeek } = setup({ durationSeconds: 3000 });
    fireEvent.keyDown(screen.getByRole("option", { name: /Finale/ }), { key: "Enter" });
    expect(onSeek).toHaveBeenCalledWith(3000);
  });

  it("moves between rows with Down, Up, Home, and End", () => {
    setup();
    const [first, second, third] = screen.getAllByRole("option");
    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "ArrowUp" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(third).toHaveFocus();
  });

  it("draws the picture at each chapter start, hidden from the row's name", () => {
    const picture = vi.fn((seconds: number) => <div role="img" aria-label={`Preview at ${seconds}`} />);
    setup({ picture });
    expect(picture.mock.calls.map(([seconds]) => seconds)).toEqual([0, 65, 3723]);
    expect(document.querySelectorAll(".ui-option-media")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Contact1:05" })).toBeInTheDocument();
  });

  it("has text-only rows without a picture", () => {
    setup();
    expect(document.querySelector(".ui-option-media")).toBeNull();
  });

  it("scales the picture to the --chapter-thumb-w token, and leaves it unscaled when the token is unreadable", () => {
    const picture = vi.fn((_seconds: number, _width?: number) => null);
    setup({ picture });
    expect(picture.mock.calls.every(([, width]) => width === undefined)).toBe(true);
    cleanup();
    document.documentElement.style.setProperty("--chapter-thumb-w", "128px");
    picture.mockClear();
    setup({ picture });
    expect(picture.mock.calls.every(([, width]) => width === 128)).toBe(true);
  });
});
