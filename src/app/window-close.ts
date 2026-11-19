// Holds the desktop window open until `beforeClose` finishes, so a playing
// session can stop and send its final report.
export function watchNativeWindowClose(beforeClose: () => Promise<void>): () => void {
  let cancelled = false;
  let closing = false;
  let removeListener: (() => void) | undefined;
  void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
    const appWindow = getCurrentWindow();
    const unlisten = await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      try {
        await beforeClose();
      } catch {
        // A failed stop must not keep the window open.
      }
      try {
        await appWindow.destroy();
      } catch {
        // Let a later close try again; Rust exits on its own close deadline
        // (src-tauri/src/close_guard.rs) if none succeeds.
        closing = false;
      }
    });
    if (cancelled) unlisten();
    else removeListener = unlisten;
  });
  return () => {
    cancelled = true;
    removeListener?.();
  };
}
