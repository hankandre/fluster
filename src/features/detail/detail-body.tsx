import { useState, type Ref } from "react";
import type { SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { imageUrlFor } from "../card-view";
import { seriesRoute } from "../routes";
import { DetailHeader, MediaBadges, PersonRow } from "../shared/ui";
import type { ArtSource } from "./art-source";
import { DetailActions, DetailMessages } from "./detail-actions";
import { detailFacts } from "./detail-facts";
import { EpisodeStrip } from "./episode-strip";
import { FileAndStreams } from "./file-and-streams";
import { mediaBadges } from "./media-badges";
import { Overview } from "./overview";
import { useFlagMutation } from "./use-flag-mutation";
import { useHeaderArt } from "./use-header-art";

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
  const imageUrl = imageUrlFor(gateway);
  const { inlineArt } = useHeaderArt(item, gateway, onArt);
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
        notice={<DetailMessages />}
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
