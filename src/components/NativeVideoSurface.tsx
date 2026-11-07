import { redactText } from "../lib/redact";
import { useLayoutEffect, useRef } from "react";
import type { PlayerEngine, PlayerSurfaceFrame } from "../domain/playback";

function sameFrame(left: PlayerSurfaceFrame | undefined, right: PlayerSurfaceFrame): boolean {
  return left?.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
    && left.scaleFactor === right.scaleFactor
    && left.visible === right.visible;
}

type QueuedFrame = {
  frame: PlayerSurfaceFrame;
  onError?: (message: string) => void;
};

class SurfaceUpdater {
  private requestInFlight = false;
  private lastFrame?: PlayerSurfaceFrame;
  private pending?: QueuedFrame;

  constructor(private readonly player: PlayerEngine) {}

  queue(frame: PlayerSurfaceFrame, onError?: (message: string) => void): void {
    this.pending = { frame, onError };
    void this.sendPending();
  }

  private async sendPending(): Promise<void> {
    if (this.requestInFlight || !this.pending) return;
    const request = this.pending;
    this.pending = undefined;
    if (sameFrame(this.lastFrame, request.frame)) return;
    this.requestInFlight = true;
    try {
      await this.player.setSurface(request.frame);
      this.lastFrame = request.frame;
    } catch (error) {
      request.onError?.(redactText(error instanceof Error ? error.message : String(error)));
    } finally {
      this.requestInFlight = false;
      void this.sendPending();
    }
  }
}

const surfaceUpdaters = new WeakMap<PlayerEngine, SurfaceUpdater>();

function updaterFor(player: PlayerEngine): SurfaceUpdater {
  let updater = surfaceUpdaters.get(player);
  if (!updater) {
    updater = new SurfaceUpdater(player);
    surfaceUpdaters.set(player, updater);
  }
  return updater;
}

export function NativeVideoSurface({ player, onError }: {
  player: PlayerEngine;
  onError(message: string): void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    let animationFrame = 0;
    let disposed = false;
    const updater = updaterFor(player);

    const update = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        updater.queue({
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scaleFactor: window.devicePixelRatio || 1,
          visible: true,
        }, (message) => {
          if (!disposed) onError(message);
        });
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      const rect = element.getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) {
        updater.queue({
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
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
