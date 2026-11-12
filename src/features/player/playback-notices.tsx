import type { ReactNode } from "react";
import { DESKTOP_ONLY_COPY, type RefusalCopy } from "./refusal-copy";
import type { LoadingBackdrop } from "./chrome/player-loading";
import { PlaybackNotice, noticeContext, type NoticeAction } from "./playback-notice";
import { safeReason } from "./safe-reason";
import { playbackErrorCopy } from "./error-copy";
import type { TransportErrorKind } from "../../lib/transport-error";
import type { LibraryItem } from "../../domain/catalog";

interface Art {
  // The item title line, once the item is known.
  context?: string;
  backdrop?: LoadingBackdrop;
}

// A route-level notice keeps a main landmark and fills the window.
export function NoticePage({ children }: { children: ReactNode }) {
  return <main className="playback-notice-page">{children}</main>;
}

// Explains why Fluster will not play this item. There is deliberately no "play anyway": Retry asks
// the server again, Back leaves.
export function RefusalNotice({ copy, item, backdrop, onRetry, retryLabel = "Retry", onBack }: {
  copy: RefusalCopy;
  item: LibraryItem;
  backdrop?: LoadingBackdrop;
  onRetry?(): void;
  retryLabel?: string;
  onBack(): void;
}) {
  return (
    <PlaybackNotice
      title={copy.title}
      context={noticeContext(item)}
      backdrop={backdrop}
      whatYouCanDo={copy.whatYouCanDo}
      retry={onRetry ? { label: retryLabel, onActivate: onRetry } : undefined}
      back={{ label: "Back to details", onActivate: onBack }}
      onEscape={onBack}
    >
      {copy.explanation}
    </PlaybackNotice>
  );
}

// The browser engine cannot play what the server would convert. Back is the only action.
export function DesktopOnlyNotice({ item, backdrop, onBack }: { item: LibraryItem; backdrop?: LoadingBackdrop; onBack(): void }) {
  return <RefusalNotice copy={DESKTOP_ONLY_COPY} item={item} backdrop={backdrop} onBack={onBack} />;
}

// The player cannot start. The handlers are props so a host can close the notice instead of leaving.
export function PlayerUnavailableNotice({ reason, context, backdrop, onRetry, onBack }: Art & {
  reason: string;
  onRetry(): void;
  onBack(): void;
}) {
  return (
    <PlaybackNotice
      title="The player cannot start"
      context={context}
      backdrop={backdrop}
      retry={{ label: "Retry", onActivate: onRetry }}
      back={{ label: "Back to details", onActivate: onBack }}
      onEscape={onBack}
    >
      {safeReason(reason)}
    </PlaybackNotice>
  );
}

export function ItemLoadNotice({ context, backdrop, onRetry, onBack }: Art & { onRetry(): void; onBack(): void }) {
  return (
    <PlaybackNotice
      title="Couldn't load this item"
      context={context}
      backdrop={backdrop}
      retry={{ label: "Retry", onActivate: onRetry }}
      back={{ label: "Back to details", onActivate: onBack }}
      onEscape={onBack}
    />
  );
}

// The item is gone from the server (DESIGN.md 10, "Item gone"). Retry would not help.
export function ItemGoneScreen({ onBack }: { onBack(): void }) {
  return (
    <PlaybackNotice
      title="This item is no longer on the server"
      back={{ label: "Go home", href: "#/next/home" }}
      onEscape={onBack}
    >
      It may have been removed or renamed.
    </PlaybackNotice>
  );
}

// The session failed: Retry renegotiates, Back leaves.
export function PlaybackErrorNotice({ item, backdrop, message, kind, serverName, retryLabel, retrying, onRetry, onBack }: {
  item: LibraryItem;
  backdrop?: LoadingBackdrop;
  message: string;
  // Set when a Jellyfin request failed: the notice then shows plain copy, never the message.
  kind?: TransportErrorKind;
  serverName: string;
  retryLabel: string;
  retrying?: boolean;
  onRetry(): void;
  onBack(): void;
}) {
  const retry: NoticeAction = { label: retryLabel, onActivate: onRetry, busy: retrying };
  return (
    <PlaybackNotice
      title="Playback could not start"
      context={noticeContext(item)}
      backdrop={backdrop}
      retry={retry}
      back={{ label: "Back to details", onActivate: onBack }}
      // usePlayerKeys owns Escape inside the player (fullscreen first), so it is not handled twice.
      onEscape={() => undefined}
    >
      {playbackErrorCopy(message, kind, serverName)}
    </PlaybackNotice>
  );
}
