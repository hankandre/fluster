import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaCardProps } from "../card-view";
import { RowError } from "../home/media-row";
import { scopeFor } from "../query-scope";
import { useRovingFocus } from "../roving-focus";
import { MediaCard } from "../shared/ui";
import { timeLeftLabel } from "../shared/time-left";
import { BrowseFrame } from "./browse-view";

export function SeriesView({ seriesId }: { seriesId: string }) {
  return (
    <BrowseFrame title="Series" routeKey={`series/${seriesId}`} back={<a href="#/next/browse">Back to libraries</a>}>
      {(gateway) => <Seasons gateway={gateway} seriesId={seriesId} />}
    </BrowseFrame>
  );
}

function Seasons({ gateway, seriesId }: { gateway: SessionGateway; seriesId: string }) {
  const scope = scopeFor(gateway);
  const [chosenId, setChosenId] = useState<string | undefined>();
  const seasons = useQuery({
    queryKey: ["browse", scope, "seasons", seriesId],
    queryFn: ({ signal }) => gateway.seasons(seriesId, signal),
    gcTime: 0,
  });

  if (seasons.isPending) return <p aria-busy="true">Loading seasons…</p>;
  if (seasons.isError) return <RowError title="seasons" onRetry={() => void seasons.refetch()} />;
  if (seasons.data.length === 0) return <p>No seasons.</p>;

  // Specials (season 0) sort first on the server but are a poor default.
  const firstRegular = seasons.data.find((season) => season.indexNumber !== 0);
  const selected = seasons.data.find((season) => season.id === chosenId) ?? firstRegular ?? seasons.data[0];

  return (
    <>
      <nav aria-label="Seasons">
        <ul className="season-list">
          {seasons.data.map((season) => (
            <li key={season.id}>
              <button
                type="button"
                aria-pressed={season.id === selected.id}
                onClick={() => setChosenId(season.id)}
              >
                {season.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <Episodes gateway={gateway} seriesId={seriesId} seasonId={selected.id} seasonName={selected.name} />
    </>
  );
}

function Episodes({ gateway, seriesId, seasonId, seasonName }: { gateway: SessionGateway; seriesId: string; seasonId: string; seasonName: string }) {
  const episodes = useQuery({
    queryKey: ["browse", scopeFor(gateway), "episodes", seriesId, seasonId],
    queryFn: ({ signal }) => gateway.episodes(seriesId, seasonId, signal),
    gcTime: 0,
  });
  const roving = useRovingFocus<HTMLUListElement>("column");
  const imageUrl = imageUrlFor(gateway);

  return (
    <section aria-label={`${seasonName} episodes`} aria-busy={episodes.isPending}>
      <h2>{seasonName}</h2>
      {episodes.isPending ? <p>Loading episodes…</p> : null}
      {episodes.isError ? <RowError title="episodes" onRetry={() => void episodes.refetch()} /> : null}
      {episodes.isSuccess && episodes.data.length === 0 ? <p>No episodes.</p> : null}
      {episodes.isSuccess ? (
        <ul className="episode-list" {...roving}>
          {episodes.data.map((episode) => (
            <li key={episode.id}>
              <MediaCard {...toMediaCardProps(episode, "episode", imageUrl)} />
              <div className="episode-text">
                <p className="episode-text-title" aria-hidden="true">{episode.title}</p>
                {episode.subtitle ? <p className="episode-text-meta" aria-hidden="true">{episode.subtitle}</p> : null}
                {episode.progress !== undefined && episode.remainingTicks !== undefined ? (
                  <p className="episode-text-meta" aria-hidden="true">{timeLeftLabel(episode.remainingTicks)}</p>
                ) : null}
                {episode.overview ? <p className="episode-overview">{episode.overview}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
