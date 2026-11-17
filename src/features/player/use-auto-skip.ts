import { useEffect, useRef } from "react";
import { segmentKey, segmentToAutoSkip, type MediaSegment } from "../../domain/media-segments";
import { skippedCopy } from "./chrome/osd-copy";

const NONE: MediaSegment[] = [];

// Seeks past an automatic-skip segment the first time the position is inside
// it, once per item. A segment is marked done before the seek, so a seek back
// into it, a retry, or a failed seek never skips it again.
export function useAutoSkip({
  itemId,
  segments = NONE,
  positionSeconds: position,
  ready,
  seek,
  showOsd,
}: {
  itemId: string;
  segments?: MediaSegment[];
  positionSeconds: number | undefined;
  ready: boolean;
  seek(seconds: number): Promise<boolean>;
  showOsd(text: string): void;
}) {
  const done = useRef<{ itemId: string; keys: Set<string> }>({ itemId, keys: new Set() });
  // Held in refs so the effect runs on position changes only.
  const latest = useRef({ seek, showOsd });
  latest.current = { seek, showOsd };

  useEffect(() => {
    if (done.current.itemId !== itemId) done.current = { itemId, keys: new Set() };
    if (!ready || position === undefined) return;
    const segment = segmentToAutoSkip(segments, position, done.current.keys);
    if (!segment) return;
    done.current.keys.add(segmentKey(segment));
    void latest.current.seek(segment.endSeconds).then((ok) => {
      if (ok) latest.current.showOsd(skippedCopy(segment.kind));
    });
  }, [itemId, segments, position, ready]);
}
