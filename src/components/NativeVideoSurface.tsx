import { useLayoutEffect, useRef } from "react";
import type { PlayerEngine } from "../domain/playback";

export function NativeVideoSurface({ player, onError }: {
  player: PlayerEngine;
  onError(message: string): void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    let animationFrame = 0;

    const update = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        void player.setSurface({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          scaleFactor: window.devicePixelRatio || 1,
          visible: true,
        }).catch((error: unknown) => {
          onError(error instanceof Error ? error.message : String(error));
        });
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      const rect = element.getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) {
        void player.setSurface({
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: rect.width,
          height: rect.height,
          scaleFactor: window.devicePixelRatio || 1,
          visible: false,
        });
      }
    };
  }, [onError, player]);

  if (player.mode === "browser") {
    return <div ref={surfaceRef} className="native-video-surface" data-browser-video-host />;
  }
  return <div ref={surfaceRef} className="native-video-surface" aria-hidden="true" />;
}
