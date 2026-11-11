import { useEffect, useState, type Ref } from "react";
import type { SessionGateway } from "../../app/session";
import type { ImageRef, ItemDetail } from "../../domain/catalog";
import { backdropWidth, imageUrlFor, POSTER_IMAGE_WIDTH } from "../card-view";
import { seriesRoute } from "../routes";
import { DetailHeader, MediaBadges, PersonRow } from "../shared/ui";
import { DetailActions, DetailMessages } from "./detail-actions";
import { detailArt } from "./detail-art";
import { detailFacts } from "./detail-facts";
import { EpisodeStrip } from "./episode-strip";
import { FileAndStreams } from "./file-and-streams";
import { mediaBadges } from "./media-badges";
import { Overview } from "./overview";
import { useCompact } from "./use-compact";
import { useFlagMutation } from "./use-flag-mutation";

// What the ambient backdrop shows: the wide image, tinted from its BlurHash (else the poster's).
export interface ArtSource {
  key: string;
  image: ImageRef | undefined;
  blurHash: string | undefined;
}

interface DetailBodyProps {
  gateway: SessionGateway;
  item: ItemDetail;
  onArt(art: ArtSource | undefined): void;
  headingRef: Ref<HTMLHeadingElement>;
}

// The loaded page: header, action bar, overview, cast, the season's other episodes, and the file and streams.
export function DetailBody({ gateway, item, onArt, headingRef }: DetailBodyProps) {
  const [chosenId, setChosenId] = useState<string | undefined>();
  const selected = item.versions.find((version) => version.id === chosenId) ?? item.versions[0];
  const played = useFlagMutation(gateway, item.id, "played");
  const favorite = useFlagMutation(gateway, item.id, "favorite");
  const art = detailArt(item);
  const imageUrl = imageUrlFor(gateway);
  const compact = useCompact();

  const artKey = `${item.id}/${art.ambient?.tag ?? "none"}`;
  const { ambient, tint } = art;
  useEffect(() => {
    onArt({ key: artKey, image: ambient, blurHash: tint });
  }, [artKey, ambient, tint, onArt]);

  const inlineArt = art.inlinePoster && item.poster
    ? { src: imageUrl(item.poster, POSTER_IMAGE_WIDTH), ...(item.poster.blurHash ? { blurHash: item.poster.blurHash } : {}), ratio: "2 / 3" as const }
    : ambient && compact
      ? { src: imageUrl(ambient, backdropWidth()), ...(ambient.blurHash ? { blurHash: ambient.blurHash } : {}), ratio: "16 / 9" as const }
      : undefined;
  const logo = item.type === "Movie" && item.logo ? { src: imageUrl(item.logo, 800) } : undefined;
  const seriesName = item.seriesName;

  return (
    <>
      <DetailHeader
        title={item.title}
        logo={logo}
        seriesLink={seriesName ? { name: seriesName, ...(item.seriesId ? { href: seriesRoute(item.seriesId) } : {}) } : undefined}
        facts={detailFacts(item)}
        badges={selected ? <MediaBadges badges={mediaBadges(selected)} /> : undefined}
        actions={<DetailActions item={item} selected={selected} onVersion={setChosenId} played={played} favorite={favorite} />}
        notice={<DetailMessages played={played} favorite={favorite} />}
        overview={item.overview ? <Overview text={item.overview} /> : undefined}
        inlineArt={inlineArt}
        headingRef={headingRef}
      />
      <div className="detail-body">
        <PersonRow people={item.cast} />
        <EpisodeStrip gateway={gateway} item={item} />
        <FileAndStreams versions={item.versions} selected={selected} />
      </div>
    </>
  );
}
