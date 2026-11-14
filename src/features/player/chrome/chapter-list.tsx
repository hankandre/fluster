import { useState, type ReactNode } from "react";
import { OptionList } from "../../shared/ui";
import { chapterAt, clock, type SeekChapter } from "./player-time";
import { PlayerSheet } from "./player-sheet";

// The thumbnail width in px from the --chapter-thumb-w token; undefined when
// it cannot be read, so the picture keeps its tile's own size.
function chapterThumbWidth(): number | undefined {
  if (typeof document === "undefined") return undefined;
  const width = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chapter-thumb-w"));
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

// The Chapters side sheet: every chapter with its start time and, when the
// version has trickplay, the picture at that start. The chapter playing now is
// marked. Enter seeks to a chapter and closes the sheet.
export function ChapterList({ id, chapters, positionSeconds, durationSeconds, picture, onSeek, onClose }: {
  id?: string;
  chapters: SeekChapter[];
  positionSeconds: number | undefined;
  durationSeconds: number | undefined;
  picture?: (seconds: number, frameWidth?: number) => ReactNode;
  onSeek(seconds: number): void;
  onClose(): void;
}) {
  const [thumbWidth] = useState(chapterThumbWidth);
  const current = positionSeconds == null ? undefined : chapterAt(chapters, positionSeconds);
  const currentIndex = current ? chapters.indexOf(current) : -1;

  const choose = (value: string) => {
    const chapter = chapters[Number(value)];
    if (!chapter) return;
    onSeek(durationSeconds ? Math.min(chapter.startSeconds, durationSeconds) : chapter.startSeconds);
    onClose();
  };

  return (
    <PlayerSheet id={id} label="Chapters" title="Chapters" onClose={onClose}>
      <OptionList
        label="Chapter"
        options={chapters.map((chapter, index) => ({
          value: String(index),
          label: chapter.name,
          description: clock(chapter.startSeconds),
          media: picture?.(chapter.startSeconds, thumbWidth),
        }))}
        value={currentIndex >= 0 ? String(currentIndex) : undefined}
        onChange={choose}
      />
    </PlayerSheet>
  );
}
