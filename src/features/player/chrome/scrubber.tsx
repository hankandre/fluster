import { useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PlaybackSnapshot } from "../../../domain/playback";
import { SEEK_STEP_SECONDS } from "../../../components/player-keymap";
import { useTvForm } from "../../shared/use-tv-form";
import { clock, endsAt, remaining, type SeekChapter } from "./player-time";
import { ScrubPreview } from "./scrub-preview";
import { useTvScrub } from "./use-tv-scrub";

function chapterAt(chapters: SeekChapter[], seconds: number): SeekChapter | undefined {
  let current: SeekChapter | undefined;
  for (const chapter of chapters) {
    if (chapter.startSeconds <= seconds) current = chapter;
  }
  return current;
}

// The seek bar: a transparent range input over a drawn track, with elapsed
// and remaining time. Without a preview or chapters it is the bare slider.
// The pointer, Left and Right (10 s), Home, and End move a pending position
// that is committed on pointer-up or key-up. In the TV form a hold scrubs until OK commits or Back drops it
// (useTvScrub).
export function Scrubber({ snapshot, onSeek, onScrubHold, seekPreview, chapters, now = () => new Date() }: {
  snapshot: PlaybackSnapshot | undefined;
  onSeek(seconds: number): void;
  // TV form: true when a hold starts a scrub, false when it ends.
  onScrubHold?(held: boolean): void;
  // Draws the picture above the position under the pointer or the keyboard position.
  seekPreview?: (seconds: number, frameWidth: number) => ReactNode;
  chapters?: SeekChapter[];
  now?: () => Date;
}) {
  const [seekValue, setSeekValue] = useState<number>();
  const [hoverSeconds, setHoverSeconds] = useState<number>();
  const [focused, setFocused] = useState(false);
  const tv = useTvForm();
  const duration = snapshot?.durationSeconds ?? 0;
  const max = Math.max(duration, 1);
  const position = seekValue ?? snapshot?.positionSeconds ?? 0;
  const enhanced = Boolean(seekPreview) || Boolean(chapters?.length);
  const previewSeconds = hoverSeconds ?? (focused ? position : undefined);
  const chapterName = previewSeconds != null && chapters ? chapterAt(chapters, previewSeconds)?.name : undefined;
  const fill = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) * 100 : 0;

  const tvScrub = useTvScrub({ playhead: snapshot?.positionSeconds ?? 0, duration, setPending: setSeekValue, onSeek, onScrubHold });

  const commit = () => {
    if (seekValue != null) onSeek(seekValue);
    setSeekValue(undefined);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
    setSeekValue(Math.min(Math.max(0, position + step), max));
  };

  const moveHover = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = (event.clientX - box.left) / box.width;
    if (!Number.isFinite(fraction)) return;
    setHoverSeconds(Math.min(Math.max(fraction, 0), 1) * duration);
  };

  const slider = (
    <input
      aria-label="Playback position"
      type="range"
      min={0}
      max={max}
      step={0.25}
      value={Math.min(position, max)}
      onChange={(event) => setSeekValue(Number(event.target.value))}
      onPointerUp={commit}
      onKeyDown={tv ? tvScrub.onKeyDown : onKeyDown}
      onKeyUp={tv ? tvScrub.onKeyUp : commit}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (tv) tvScrub.onBlur();
      }}
      disabled={!snapshot || !duration}
    />
  );
  const rail = (
    <div className="scrub-rail">
      <div className="scrub-fill" style={{ width: `${fill}%` }} />
      <span className="scrub-thumb" style={{ left: `${fill}%` }} />
      {duration > 0 && chapters?.map((chapter) => {
        if (chapter.startSeconds <= 0 || chapter.startSeconds >= duration) return null;
        return (
          <span
            key={`${chapter.startSeconds}-${chapter.name}`}
            className="seek-chapter"
            role="img"
            aria-label={`Chapter: ${chapter.name} at ${clock(chapter.startSeconds)}`}
            style={{ left: `${(chapter.startSeconds / duration) * 100}%` }}
          />
        );
      })}
    </div>
  );

  const secondsLeft = duration > 0 ? Math.max(0, duration - position) : undefined;
  return (
    <div className="seek-row">
      <span className="player-time">{clock(position)}</span>
      {enhanced ? (
        <div className="seek-track" onPointerMove={moveHover} onPointerLeave={() => setHoverSeconds(undefined)}>
          {slider}
          {rail}
          {previewSeconds != null && duration > 0 && (
            <ScrubPreview seconds={previewSeconds} duration={duration} chapterName={chapterName} picture={seekPreview} />
          )}
        </div>
      ) : (
        <>
          {slider}
          {rail}
        </>
      )}
      <span className="player-time seek-end">
        <span className="visually-hidden">Time remaining </span>
        {remaining(position, snapshot?.durationSeconds)}
        {secondsLeft !== undefined && !snapshot?.paused && (
          <span className="seek-ends-at">Ends at {endsAt(now(), secondsLeft)}</span>
        )}
      </span>
    </div>
  );
}
