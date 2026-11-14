// A named point on the seek bar.
export interface SeekChapter {
  startSeconds: number;
  name: string;
}

// The chapter playing at a time: the last one that starts at or before it.
export function chapterAt(chapters: SeekChapter[], seconds: number): SeekChapter | undefined {
  let current: SeekChapter | undefined;
  for (const chapter of chapters) {
    if (chapter.startSeconds <= seconds) current = chapter;
  }
  return current;
}

const MINUS = "−";

function parts(value: number): { hours: number; minutes: number; seconds: number } {
  const whole = Math.max(0, Math.floor(value));
  return { hours: Math.floor(whole / 3600), minutes: Math.floor((whole % 3600) / 60), seconds: whole % 60 };
}

// "1:05" or "1:02:03"; "--:--" when the time is not known.
export function clock(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--:--";
  const { hours, minutes, seconds } = parts(value);
  const rest = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

// Time left, with a true minus sign: "−1:21:40".
export function remaining(position: number, duration: number | undefined): string {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return `${MINUS}--:--`;
  return `${MINUS}${clock(Math.max(0, duration - position))}`;
}

// The wall-clock time playback would end at, in the viewer's own format.
export function endsAt(now: Date, secondsLeft: number): string {
  const end = new Date(now.getTime() + Math.max(0, secondsLeft) * 1000);
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(end);
}
