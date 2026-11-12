import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaSegment } from "../../../domain/media-segments";
import { SkipButton } from "./skip-button";

const intro: MediaSegment = { kind: "Intro", startSeconds: 10, endSeconds: 70 };
const outro: MediaSegment = { kind: "Outro", startSeconds: 1000, endSeconds: 1100 };

afterEach(cleanup);

describe("SkipButton", () => {
  it("offers Skip intro and seeks to the segment end", () => {
    const onSkip = vi.fn();
    render(<SkipButton segment={intro} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip intro" }));

    expect(onSkip).toHaveBeenCalledWith(70);
  });

  it("offers Skip credits and seeks to the segment end", () => {
    const onSkip = vi.fn();
    render(<SkipButton segment={outro} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip credits" }));

    expect(onSkip).toHaveBeenCalledWith(1100);
  });

  it("is a focusable pill that does not take focus on its own", () => {
    render(<SkipButton segment={intro} onSkip={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Skip intro" });
    expect(button).toHaveClass("skip-button");
    expect(button).not.toHaveFocus();
    button.focus();
    expect(button).toHaveFocus();
  });

  it("hides its icon from assistive technology", () => {
    render(<SkipButton segment={intro} onSkip={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Skip intro" }).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
