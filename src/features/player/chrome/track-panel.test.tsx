import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot, PlayerTrack } from "../../../domain/playback";
import { TrackPanel } from "./track-panel";
import type { ConvertedTracks } from "./track-options";

afterEach(cleanup);

function track(playerId: number, type: PlayerTrack["type"], title: string, selected = false): PlayerTrack {
  return { playerId, jellyfinIndex: playerId + 10, type, title, external: false, selected };
}

const snapshot: PlaybackSnapshot = {
  positionSeconds: 0,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [track(1, "Audio", "English", true), track(2, "Audio", "French"), track(3, "Subtitle", "English SRT")],
  diagnostics: { decodeMode: "hardware", decodeLabel: "Hardware", droppedFrames: 0 },
};

const converted: ConvertedTracks = {
  audio: [{ jellyfinIndex: 1, title: "English", selected: true }, { jellyfinIndex: 2, title: "French", selected: false }],
  subtitle: [{ jellyfinIndex: 4, title: "English PGS", selected: false }],
};

const audio = () => screen.getByRole("listbox", { name: "Audio track" });
const subtitles = () => screen.getByRole("listbox", { name: "Subtitle track" });

describe("TrackPanel", () => {
  it("has the title, the two headings, and focus on the selected audio row", () => {
    render(<TrackPanel snapshot={snapshot} onSelect={vi.fn()} onChangeConverted={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Audio and subtitles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio & Subtitles", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subtitles", level: 3 })).toBeInTheDocument();
    expect(within(audio()).getByRole("option", { name: "English" })).toHaveFocus();
  });

  it("switches direct-play tracks in the player by id, with off for subtitles, and stays open", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TrackPanel snapshot={snapshot} onSelect={onSelect} onChangeConverted={vi.fn()} onClose={onClose} />);
    fireEvent.click(within(audio()).getByRole("option", { name: "French" }));
    fireEvent.click(within(subtitles()).getByRole("option", { name: "English SRT" }));
    fireEvent.click(within(subtitles()).getByRole("option", { name: "Subtitles off" }));
    expect(onSelect.mock.calls).toEqual([["audio", 2], ["subtitle", 3], ["subtitle", undefined]]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("chooses with the arrow keys and Enter", () => {
    const onSelect = vi.fn();
    render(<TrackPanel snapshot={snapshot} onSelect={onSelect} onChangeConverted={vi.fn()} onClose={vi.fn()} />);
    const english = within(audio()).getByRole("option", { name: "English" });
    fireEvent.keyDown(english, { key: "ArrowDown" });
    const french = within(audio()).getByRole("option", { name: "French" });
    expect(french).toHaveFocus();
    fireEvent.keyDown(french, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("audio", 2);
  });

  it("lists the source's streams for a converted session and hands the Jellyfin index to the change", () => {
    const onChange = vi.fn(async () => undefined);
    const onChangeConverted = vi.fn((change: () => Promise<void>) => void change());
    render(<TrackPanel snapshot={snapshot} converted={{ tracks: converted, onChange }} onSelect={vi.fn()} onChangeConverted={onChangeConverted} onClose={vi.fn()} />);
    expect(within(subtitles()).getAllByRole("option").map((option) => option.textContent)).toEqual(["Subtitles off", "English PGS"]);
    fireEvent.click(within(audio()).getByRole("option", { name: "French" }));
    fireEvent.click(within(subtitles()).getByRole("option", { name: "Subtitles off" }));
    expect(onChange.mock.calls).toEqual([["audio", 2], ["subtitle", undefined]]);
  });

  it("disables the lists without a snapshot", () => {
    render(<TrackPanel snapshot={undefined} onSelect={vi.fn()} onChangeConverted={vi.fn()} onClose={vi.fn()} />);
    expect(audio()).toHaveAttribute("aria-disabled", "true");
    expect(subtitles()).toHaveAttribute("aria-disabled", "true");
  });

  it("closes with Close", () => {
    const onClose = vi.fn();
    render(<TrackPanel snapshot={snapshot} onSelect={vi.fn()} onChangeConverted={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
