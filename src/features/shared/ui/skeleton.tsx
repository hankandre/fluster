import type { CSSProperties } from "react";
import "./feedback.css";

interface SkeletonProps {
  shape?: "line" | "block" | "circle";
  // CSS lengths. Use tokens such as "var(--poster-w)".
  width?: string;
  height?: string;
  // Makes it a poster (2 / 3) or a thumb (16 / 9) when no height is given.
  aspectRatio?: string;
}

// A placeholder shaped like the content it stands in for. It is hidden from assistive technology:
// the container sets aria-busy and offers one "Loading" text. It appears after 150 ms so fast loads do not flash.
export function Skeleton({ shape = "block", width, height, aspectRatio }: SkeletonProps) {
  const style: CSSProperties = { width, height, aspectRatio };
  return <div className="ui-skeleton" data-shape={shape} data-ratio={aspectRatio && !height ? "" : undefined} style={style} aria-hidden="true" />;
}
