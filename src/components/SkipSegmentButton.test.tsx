import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaSegment } from "../domain/media-segments";
import { SkipSegmentButton } from "./SkipSegmentButton";

const segments: MediaSegment[] = [
  { kind: "Intro", startSeconds: 10, endSeconds: 70 },
  { kind: "Outro", startSeconds: 1000, endSeconds: 1100 },
];

afterEach(cleanup);

describe("SkipSegmentButton", () => {
  it("offers Skip intro inside an intro and seeks to its end", () => {
    const onSeek = vi.fn();
    render(<SkipSegmentButton segments={segments} positionSeconds={30} onSeek={onSeek} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip intro" }));

    expect(onSeek).toHaveBeenCalledWith(70);
  });

  it("offers Skip credits inside an outro and seeks to its end", () => {
    const onSeek = vi.fn();
    render(<SkipSegmentButton segments={segments} positionSeconds={1010} onSeek={onSeek} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip credits" }));

    expect(onSeek).toHaveBeenCalledWith(1100);
  });

  it("renders nothing outside segments, near a segment's end, or without segments", () => {
    const { container, rerender } = render(<SkipSegmentButton segments={segments} positionSeconds={500} onSeek={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SkipSegmentButton segments={segments} positionSeconds={69.5} onSeek={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SkipSegmentButton segments={[]} positionSeconds={30} onSeek={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a focusable button that does not take focus on its own", () => {
    const { rerender } = render(<SkipSegmentButton segments={segments} positionSeconds={5} onSeek={vi.fn()} />);
    rerender(<SkipSegmentButton segments={segments} positionSeconds={30} onSeek={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Skip intro" });
    expect(button).not.toHaveFocus();
    button.focus();
    expect(button).toHaveFocus();
  });
});
