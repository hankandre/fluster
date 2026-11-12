import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clock } from "./player-time";

// The frame above the scrub position: a trickplay picture scaled to the frame,
// with the time (and chapter name) inside its lower edge. With chapters but no
// pictures it is a pill with the same text. CSS clamps it inside the gutter.
export function ScrubPreview({ seconds, duration, chapterName, picture }: {
  seconds: number;
  duration: number;
  chapterName?: string;
  picture?: (seconds: number, frameWidth: number) => ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useLayoutEffect(() => {
    setFrameWidth(frame.current?.offsetWidth ?? 0);
  }, []);

  const caption = (
    <span className="scrub-preview-caption">
      <strong>{clock(seconds)}</strong>
      {chapterName && <em>{chapterName}</em>}
    </span>
  );
  const style = { "--seek-x": `${(seconds / duration) * 100}%` } as CSSProperties;

  return (
    <div className="seek-preview" style={style}>
      {picture ? (
        <div ref={frame} className="scrub-preview-frame">
          {picture(seconds, frameWidth)}
          {caption}
        </div>
      ) : (
        <div className="scrub-preview-pill">{caption}</div>
      )}
    </div>
  );
}
