import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ImageRef, ItemDetail } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { BrowseFrame } from "../browse/browse-view";
import { CardImage } from "../home/card-image";
import { RowError } from "../home/media-row";
import { detailKey } from "./detail-key";
import { runtimeLabel } from "./format";
import { MediaInfo, VersionPicker } from "./media-info";
import { WatchState } from "./watch-state";

const POSTER_WIDTH = 400;
const BACKDROP_WIDTH = 1280;

export function ItemDetailView({ itemId }: { itemId: string }) {
  return (
    <BrowseFrame title="Details" routeKey={`item/${itemId}`} back={<a href="#/next/home">Back to home</a>}>
      {(gateway) => <ItemDetail key={itemId} gateway={gateway} itemId={itemId} />}
    </BrowseFrame>
  );
}

function ItemDetail({ gateway, itemId }: { gateway: SessionGateway; itemId: string }) {
  const query = useQuery({
    queryKey: detailKey(gateway, itemId),
    queryFn: ({ signal }) => gateway.itemDetail(itemId, signal),
    gcTime: 0,
  });

  if (query.isPending) return <p aria-busy="true">Loading details…</p>;
  if (query.isError) return <RowError title="this item" onRetry={() => void query.refetch()} />;
  return <DetailBody gateway={gateway} item={query.data} />;
}

function DetailBody({ gateway, item }: { gateway: SessionGateway; item: ItemDetail }) {
  const [chosenId, setChosenId] = useState<string | undefined>();
  const selected = item.versions.find((version) => version.id === chosenId) ?? item.versions[0];
  const facts = [item.year?.toString(), runtimeLabel(item.runTimeTicks), item.episodeLabel].filter(Boolean).join(" · ");

  return (
    <article className="item-detail" aria-label={item.title}>
      {item.backdrop ? (
        <div className="detail-backdrop">
          <ArtImage gateway={gateway} image={item.backdrop} width={BACKDROP_WIDTH} />
        </div>
      ) : null}
      <div className="detail-head">
        {item.poster ? (
          <div className="detail-poster">
            <ArtImage gateway={gateway} image={item.poster} width={POSTER_WIDTH} />
          </div>
        ) : null}
        <div>
          <h2>{item.title}</h2>
          {item.seriesName ? <p className="detail-series">{item.seriesName}</p> : null}
          {facts ? <p>{facts}</p> : null}
          {item.genres.length > 0 ? <p>{item.genres.join(", ")}</p> : null}
          <WatchState gateway={gateway} item={item} />
        </div>
      </div>
      {item.overview ? <p className="detail-overview">{item.overview}</p> : null}
      {item.cast.length > 0 ? (
        <section aria-label="Cast">
          <h3>Cast</h3>
          <ul className="cast-list">
            {item.cast.map((member, index) => (
              <li key={index}>{member.role ? `${member.name} as ${member.role}` : member.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {selected ? (
        <section aria-label="Versions and media info">
          <h3>Media</h3>
          {item.versions.length > 1 ? (
            <VersionPicker versions={item.versions} selectedId={selected.id} onSelect={setChosenId} />
          ) : null}
          <MediaInfo version={selected} />
        </section>
      ) : (
        <p>No media information for this item.</p>
      )}
    </article>
  );
}

function ArtImage({ gateway, image, width }: { gateway: SessionGateway; image: ImageRef; width: number }) {
  return <CardImage image={image} src={gateway.imageUrl(image.itemId, image.type, image.tag, width)} />;
}
