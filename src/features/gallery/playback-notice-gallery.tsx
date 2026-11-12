import { useState } from "react";
import { PlayerUnavailableNotice } from "../player/playback-notices";
import { Button } from "../shared/ui";
import "../player/playback-notice.css";

// The route-level notices need a player that fails to start, and the browser engine never does.
// This shows one over the page; Back, Retry, and Escape close it.
export function PlaybackNoticeGallery() {
  const [open, setOpen] = useState(false);
  return (
    <section className="gallery-section" aria-label="Playback notices">
      <h2>Playback notices</h2>
      <div className="gallery-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>Show Player cannot start</Button>
      </div>
      {open && (
        <div className="playback-notice-overlay">
          <PlayerUnavailableNotice
            context="Harbor Lights · S1 · E2 The Keeper's Log"
            reason="libmpv could not be loaded."
            onRetry={() => setOpen(false)}
            onBack={() => setOpen(false)}
          />
        </div>
      )}
    </section>
  );
}
