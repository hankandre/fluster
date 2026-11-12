import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot } from "../../../domain/playback";
import { endsAt } from "./player-time";
import { Scrubber } from "./scrubber";

afterEach(cleanup);

const snapshot: PlaybackSnapshot = {
  positionSeconds: 600,
  durationSeconds: 3600,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

const now = () => new Date(2026, 10, 11, 20, 0, 0);
const slider = () => screen.getByRole("slider", { name: "Playback position" });

describe("Scrubber", () => {
  it("shows elapsed and remaining time, and when playback will end", () => {
    render(<Scrubber snapshot={snapshot} onSeek={vi.fn()} now={now} />);
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText(/−50:00/)).toBeInTheDocument();
    expect(screen.getByText(`Ends at ${endsAt(now(), 3000)}`)).toBeInTheDocument();
    expect(screen.getByText("Time remaining")).toHaveClass("visually-hidden");
  });

  it("drops Ends at while paused or without a duration", () => {
    const { rerender } = render(<Scrubber snapshot={{ ...snapshot, paused: true }} onSeek={vi.fn()} now={now} />);
    expect(screen.queryByText(/Ends at/)).not.toBeInTheDocument();
    rerender(<Scrubber snapshot={{ ...snapshot, durationSeconds: undefined }} onSeek={vi.fn()} now={now} />);
    expect(screen.queryByText(/Ends at/)).not.toBeInTheDocument();
    expect(slider()).toBeDisabled();
  });

  it("steps ten seconds with Left and Right, follows with the preview, and commits on key-up", () => {
    const onSeek = vi.fn();
    const { container } = render(<Scrubber snapshot={snapshot} onSeek={onSeek} seekPreview={(seconds) => <div data-testid="thumb">{seconds}</div>} />);
    fireEvent.focus(slider());
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(screen.getByTestId("thumb")).toHaveTextContent("610");
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(screen.getByTestId("thumb")).toHaveTextContent("620");
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.keyUp(slider(), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(620);
    expect(container.querySelector(".seek-preview")).not.toBeNull();
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    fireEvent.keyUp(slider(), { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(590);
  });

  it("keeps the step within the file", () => {
    const onSeek = vi.fn();
    render(<Scrubber snapshot={{ ...snapshot, positionSeconds: 3 }} onSeek={onSeek} />);
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    fireEvent.keyUp(slider(), { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("names each chapter gap inside the file and leaves out the opening one", () => {
    render(
      <Scrubber
        snapshot={snapshot}
        onSeek={vi.fn()}
        chapters={[{ startSeconds: 0, name: "Opening" }, { startSeconds: 900, name: "Contact" }, { startSeconds: 4000, name: "Beyond" }]}
      />,
    );
    expect(screen.getAllByRole("img").map((marker) => marker.getAttribute("aria-label"))).toEqual(["Chapter: Contact at 15:00"]);
  });

  it("clamps the preview inside the track with a CSS clamp around the pointer position", () => {
    const { container } = render(<Scrubber snapshot={snapshot} onSeek={vi.fn()} seekPreview={() => null} />);
    const track = container.querySelector(".seek-track") as HTMLElement;
    track.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, right: 400, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(track, new MouseEvent("pointermove", { bubbles: true, clientX: 4 }));
    const preview = container.querySelector(".seek-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--seek-x")).toBe("1%");
  });

  it("shows a pill with the time and chapter when there are chapters but no pictures", () => {
    const { container } = render(<Scrubber snapshot={snapshot} onSeek={vi.fn()} chapters={[{ startSeconds: 300, name: "Start" }]} />);
    fireEvent.focus(slider());
    expect(container.querySelector(".scrub-preview-pill")).toHaveTextContent("10:00");
    expect(container.querySelector(".scrub-preview-pill")).toHaveTextContent("Start");
  });
});
