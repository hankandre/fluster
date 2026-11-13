import { useEffect, useRef, type KeyboardEvent } from "react";
import { HOLD_MS } from "../../shared/hold-key";
import { SCRUB_TICK_MS, scrubStep, scrubTarget } from "./scrub-step";

const PRESS_STEP_SECONDS = 10;

interface TvScrubOptions {
  // Seconds of the playhead and of the whole item.
  playhead: number;
  duration: number;
  setPending(seconds: number | undefined): void;
  onSeek(seconds: number): void;
  // True when a hold starts a scrub (the picture is held), false when it is committed or cancelled.
  onScrubHold?(held: boolean): void;
}

function direction(key: string): 1 | -1 | undefined {
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  return undefined;
}

// The TV-form keys of the scrubber (DESIGN.md 7.14, D16 B): a press of Left or Right steps 10 s and commits on
// release; a hold of HOLD_MS starts a scrub that moves a pending position in growing steps until OK commits it
// or Back drops it.
export function useTvScrub(options: TvScrubOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const pending = useRef<number | undefined>(undefined);
  const scrubbing = useRef(false);
  const heldKey = useRef<string | undefined>(undefined);
  const downAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const tick = useRef<number | undefined>(undefined);

  function stopTimers() {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    if (tick.current !== undefined) window.clearInterval(tick.current);
    timer.current = undefined;
    tick.current = undefined;
  }

  function setPending(seconds: number | undefined) {
    pending.current = seconds;
    latest.current.setPending(seconds);
  }

  function finish(commit: boolean) {
    stopTimers();
    heldKey.current = undefined;
    const wasScrubbing = scrubbing.current;
    const target = pending.current;
    scrubbing.current = false;
    setPending(undefined);
    if (commit && target !== undefined) latest.current.onSeek(target);
    if (wasScrubbing) latest.current.onScrubHold?.(false);
  }

  function startTimer(key: 1 | -1) {
    stopTimers();
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (!scrubbing.current) {
        scrubbing.current = true;
        latest.current.onScrubHold?.(true);
      }
      tick.current = window.setInterval(() => {
        const { playhead, duration } = latest.current;
        const step = scrubStep(Date.now() - downAt.current, duration);
        setPending(scrubTarget(pending.current ?? playhead, step, key, duration));
      }, SCRUB_TICK_MS);
    }, HOLD_MS);
  }

  useEffect(() => stopTimers, []);

  return {
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const dir = direction(event.key);
      if (dir === undefined) {
        if (!scrubbing.current) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
        return;
      }
      event.preventDefault();
      if (event.repeat) {
        // Held from hidden chrome: the waking press did not move time, but the hold still starts a scrub.
        if (heldKey.current !== event.key) {
          heldKey.current = event.key;
          downAt.current = Date.now();
          startTimer(dir);
        }
        return;
      }
      const { playhead, duration } = latest.current;
      setPending(scrubTarget(pending.current ?? playhead, PRESS_STEP_SECONDS, dir, duration));
      heldKey.current = event.key;
      downAt.current = Date.now();
      startTimer(dir);
    },
    onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== heldKey.current) return;
      stopTimers();
      heldKey.current = undefined;
      if (!scrubbing.current) finish(true);
    },
    onBlur() {
      if (heldKey.current !== undefined || scrubbing.current || pending.current !== undefined) finish(false);
    },
  };
}
