import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerEngine } from "../../../domain/playback";

// Fullscreen state for the player. The browser engine follows the document;
// the native engine follows the window. A change the player rejects is rolled back.
export function useFullscreen(player: PlayerEngine, execute: (operation: () => Promise<void>) => Promise<boolean>) {
  const [fullscreen, setFullscreen] = useState(false);
  const current = useRef(fullscreen);

  useEffect(() => {
    current.current = fullscreen;
  }, [fullscreen]);

  const change = useCallback(async (next: boolean) => {
    const previous = current.current;
    current.current = next;
    setFullscreen(next);
    const changed = await execute(() => player.setFullscreen(next));
    if (!changed) {
      current.current = previous;
      setFullscreen(previous);
    }
  }, [execute, player]);

  useEffect(() => {
    const update = (value: boolean) => {
      current.current = value;
      setFullscreen(value);
    };
    if (player.mode === "browser") {
      const onFullscreenChange = () => update(Boolean(document.fullscreenElement));
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
    }

    let cancelled = false;
    let removeListener: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const sync = async () => {
        const value = await appWindow.isFullscreen();
        if (!cancelled) update(value);
      };
      await sync();
      const unlisten = await appWindow.onResized(() => void sync());
      if (cancelled) unlisten();
      else removeListener = unlisten;
    });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [player.mode]);

  return { fullscreen, fullscreenRef: current, changeFullscreen: change };
}
