import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import type { ItemDetail, LibraryItem } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { backdropWidth } from "../card-view";
import { blurhashToDataUrl } from "../home/blurhash";
import { Button, ButtonLink, Notice } from "../shared/ui";
import { useEscapeKey } from "../use-escape-key";
import { toPlayableItem } from "./playable-item";
import { titleLine } from "./chrome/player-top-bar";
import type { LoadingBackdrop } from "./chrome/player-loading";
import "./playback-notice.css";

export interface NoticeAction {
  label: string;
  onActivate(): void;
  busy?: boolean;
}

export interface NoticeLink {
  label: string;
  href: string;
}

interface PlaybackNoticeProps {
  title: string;
  // The item title line; omitted when the item is not known yet.
  context?: string;
  backdrop?: LoadingBackdrop;
  // The explanation.
  children?: ReactNode;
  whatYouCanDo?: string;
  // Primary and first.
  retry?: NoticeAction;
  // Secondary; primary when there is no retry.
  back: NoticeAction | NoticeLink;
  onEscape(): void;
}

// "Series · S1 · E2 Name" for an episode of a known series, else the item's title line.
export function noticeContext(item: LibraryItem): string {
  return item.type === "Episode" && item.seriesName ? `${item.seriesName} · ${titleLine(item)}` : titleLine(item);
}

export function noticeBackdrop(gateway: SessionGateway, detail: ItemDetail): LoadingBackdrop | undefined {
  if (!detail.backdrop) return undefined;
  return {
    src: gateway.imageUrl(detail.backdrop.itemId, detail.backdrop.type, detail.backdrop.tag, backdropWidth()),
    blurHash: detail.backdrop.blurHash,
  };
}

// The context line and art for a loaded item detail; both are absent until it arrives.
export function detailArt(gateway: SessionGateway, detail: ItemDetail | undefined): { context?: string; backdrop?: LoadingBackdrop } {
  if (!detail) return {};
  return { context: noticeContext(toPlayableItem(detail)), backdrop: noticeBackdrop(gateway, detail) };
}

function isLink(action: NoticeAction | NoticeLink): action is NoticeLink {
  return "href" in action;
}

// A full-screen "playback can't go on" state: the item's backdrop at 30% under the hero and floor
// scrims, then the shared Notice (DESIGN.md 7.16). The heading takes focus; Tab then visits Retry and
// Back to details in order, and the arrow keys move between them.
export function PlaybackNotice({ title, context, backdrop, children, whatYouCanDo, retry, back, onEscape }: PlaybackNoticeProps) {
  useEscapeKey(onEscape);
  const heading = useRef<HTMLHeadingElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const placeholder = useMemo(() => (backdrop?.blurHash ? blurhashToDataUrl(backdrop.blurHash) : undefined), [backdrop?.blurHash]);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const controls = () => Array.from(actions.current?.querySelectorAll<HTMLElement>("button, a") ?? []);

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== heading.current) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowRight") return;
    const first = controls()[0];
    if (!first) return;
    event.preventDefault();
    first.focus();
  };

  const onActionsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const list = controls();
    const index = list.findIndex((element) => element === document.activeElement);
    const next = list[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (index === -1 || !next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className="playback-notice" role="alert" onKeyDown={onRootKeyDown}>
      {backdrop && (
        <div className="playback-notice-art" style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}>
          {backdrop.src && <img src={backdrop.src} alt="" />}
        </div>
      )}
      <div className="playback-notice-scrim" />
      <div className="playback-notice-layer">
        <Notice
          title={title}
          context={context}
          headingRef={heading}
          whatYouCanDo={whatYouCanDo ? <p><strong>What you can do:</strong> {whatYouCanDo}</p> : undefined}
          actions={
            <div className="playback-notice-actions" role="group" aria-label="Actions" ref={actions} onKeyDown={onActionsKeyDown}>
              {retry && (
                <Button variant="primary" onClick={retry.onActivate} disabled={retry.busy}>
                  {retry.busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
                  {retry.label}
                </Button>
              )}
              {isLink(back) ? (
                <ButtonLink variant={retry ? "secondary" : "primary"} href={back.href}>{back.label}</ButtonLink>
              ) : (
                <Button variant={retry ? "secondary" : "primary"} onClick={back.onActivate}>{back.label}</Button>
              )}
            </div>
          }
        >
          {children}
        </Notice>
      </div>
    </div>
  );
}
