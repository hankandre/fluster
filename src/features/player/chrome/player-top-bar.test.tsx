import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../../domain/catalog";
import { conversionIndicator } from "../conversion-copy";
import { PlayerTopBar, titleLine } from "./player-top-bar";

afterEach(cleanup);

const movie: LibraryItem = { id: "m", name: "Arrival", type: "Movie", resumePositionTicks: 0, played: false };
const episode: LibraryItem = { id: "e", name: "The Keeper's Log", type: "Episode", seriesName: "Hearth", season: 1, episode: 2, resumePositionTicks: 0, played: false };
const indicator = conversionIndicator({ delivery: "hls", playMethod: "Transcode", conversionReasons: ["ContainerBitrateExceedsLimit"], subtitlesBurnedIn: true } as never);

describe("PlayerTopBar", () => {
  it("shows a movie's name alone, with no kicker", () => {
    render(<PlayerTopBar item={movie} onBack={vi.fn()} onOpenInfo={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Arrival" })).toBeInTheDocument();
    expect(screen.queryByText(/NOW PLAYING/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Converting/ })).not.toBeInTheDocument();
  });

  it("shows the series above an episode with its season and number", () => {
    render(<PlayerTopBar item={episode} onBack={vi.fn()} onOpenInfo={vi.fn()} />);
    expect(screen.getByText("Hearth")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("S1 · E2 The Keeper's Log");
  });

  it("falls back to the name when the numbers are unknown", () => {
    expect(titleLine({ ...episode, season: undefined })).toBe("The Keeper's Log");
  });

  it("calls Back, and shows a conversion chip that opens Info", () => {
    const onBack = vi.fn();
    const onOpenInfo = vi.fn();
    render(<PlayerTopBar item={movie} indicator={indicator} onBack={onBack} onOpenInfo={onOpenInfo} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    const chip = screen.getByRole("button", { name: /Converting on server/ });
    expect(chip).toHaveTextContent("Subtitles are burned in");
    fireEvent.click(chip);
    expect(onOpenInfo).toHaveBeenCalledTimes(1);
  });
});
