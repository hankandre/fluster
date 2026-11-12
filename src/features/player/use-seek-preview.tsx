import { useEffect, useState, type ReactNode } from "react";
import type { SessionGateway } from "../../app/session";
import type { Chapter, ItemDetail } from "../../domain/catalog";
import { TileCache } from "./tile-cache";
import { TrickplayThumbnail } from "./trickplay-thumbnail";

export interface SeekPreviewProps {
  seekPreview?: (seconds: number, frameWidth?: number) => ReactNode;
  chapters?: Chapter[];
}

// The optional seek bar props for PlayerView: trickplay thumbnails when the
// chosen version has them, and the item's chapters.
export function useSeekPreview(gateway: SessionGateway, detail: ItemDetail, mediaSourceId: string | undefined): SeekPreviewProps {
  const version = detail.versions.find((candidate) => candidate.id === mediaSourceId) ?? detail.versions[0];
  const info = version?.trickplay;
  const versionId = version?.id;
  const itemId = detail.id;
  const [cache, setCache] = useState<TileCache>();

  useEffect(() => {
    if (!info || !versionId) return;
    const created = new TileCache((index, signal) => gateway.trickplayTile(itemId, versionId, info.width, index, signal));
    setCache(created);
    return () => {
      created.dispose();
      setCache(undefined);
    };
  }, [gateway, itemId, versionId, info]);

  const props: SeekPreviewProps = {};
  if (info && cache) {
    props.seekPreview = (seconds, frameWidth) => (
      <TrickplayThumbnail info={info} cache={cache} seconds={seconds} label={`Preview at ${clock(seconds)}`} frameWidth={frameWidth} />
    );
  }
  if (detail.chapters?.length) props.chapters = detail.chapters;
  return props;
}

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(hours > 0 ? 2 : 1, "0");
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
