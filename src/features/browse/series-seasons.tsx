import { useEffect, useId, useState } from "react";
import type { SessionGateway } from "../../app/session";
import { cardImageFor, cardPlayRoute, imageUrlFor, playActivation, WIDE_IMAGE_WIDTH } from "../card-view";
import { runtimeLabel } from "../detail/format";
import { itemRoute, playRoute } from "../routes";
import { readOnReturn, rememberForReturn } from "../shell/focus-return";
import { EpisodeList, EpisodeRow, InlineError, SegmentedTabPanel, SegmentedTabs, Skeleton } from "../shared/ui";
import { initialSeason, orderSeasons } from "./series-next";
import { useSeasonEpisodes, useSeriesNextUp, useSeriesSeasons } from "./series-queries";

const SEASON_SLOT = "season";

// Season tabs (Specials last) over the selected season's episodes. The tabs wait for Next Up so the right season opens.
export function SeriesSeasons({ gateway, seriesId }: { gateway: SessionGateway; seriesId: string }) {
  const headingId = useId();
  const idBase = useId();
  // A Back to this entry reopens the season that was shown.
  const [chosenId, setChosenId] = useState<string | undefined>(() => {
    const remembered = readOnReturn(SEASON_SLOT);
    return typeof remembered === "string" ? remembered : undefined;
  });
  const seasons = useSeriesSeasons(gateway, seriesId);
  const nextUp = useSeriesNextUp(gateway, seriesId);

  let content;
  if (seasons.isPending || nextUp.isPending) {
    content = <SeasonsSkeleton />;
  } else if (seasons.isError) {
    content = <InlineError spatial message="Couldn't load the seasons." onRetry={() => void seasons.refetch()} />;
  } else if (seasons.data.length === 0) {
    content = <p className="series-empty">This series has no episodes yet.</p>;
  } else {
    const ordered = orderSeasons(seasons.data);
    const selected = ordered.find((season) => season.id === chosenId) ?? initialSeason(ordered, nextUp.data ?? undefined) ?? ordered[0];
    content = (
      <>
        <SegmentedTabs
          label="Seasons"
          items={ordered.map(({ id, name }) => ({ id, label: name }))}
          value={selected.id}
          onChange={setChosenId}
          spatial
          idBase={idBase}
        />
        <RememberSeason id={selected.id} />
        <SegmentedTabPanel idBase={idBase} id={selected.id}>
          <SeasonEpisodes gateway={gateway} seriesId={seriesId} seasonId={selected.id} seasonName={selected.name} />
        </SegmentedTabPanel>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="series-seasons">
      <h2 id={headingId} className="visually-hidden">Episodes</h2>
      {content}
    </section>
  );
}

// Keeps the shown season for a later Back to this entry.
function RememberSeason({ id }: { id: string }) {
  useEffect(() => rememberForReturn(SEASON_SLOT, id), [id]);
  return null;
}

function SeasonsSkeleton() {
  return (
    <div aria-busy="true" className="series-skeleton">
      <div className="series-skeleton-tabs">
        {[0, 1, 2].map((key) => <Skeleton key={key} shape="block" width="var(--skeleton-action-w)" height="var(--control-h)" />)}
      </div>
      <EpisodeSkeletons />
    </div>
  );
}

function EpisodeSkeletons() {
  return (
    <div className="series-skeleton-rows" aria-busy="true">
      {[0, 1, 2].map((key) => <Skeleton key={key} shape="block" width="var(--thumb-w)" aspectRatio="16 / 9" />)}
    </div>
  );
}

function SeasonEpisodes({ gateway, seriesId, seasonId, seasonName }: { gateway: SessionGateway; seriesId: string; seasonId: string; seasonName: string }) {
  const episodes = useSeasonEpisodes(gateway, seriesId, seasonId);
  const imageUrl = imageUrlFor(gateway);

  if (episodes.isPending) return <EpisodeSkeletons />;
  if (episodes.isError) return <InlineError spatial message="Couldn't load the episodes." onRetry={() => void episodes.refetch()} />;
  if (episodes.data.length === 0) return <p className="series-empty">No episodes in this season.</p>;
  return (
    <EpisodeList label={`${seasonName} episodes`}>
      {episodes.data.map((episode) => {
        const route = cardPlayRoute(episode);
        const art = cardImageFor(episode, "episode");
        const runtime = runtimeLabel(episode.runTimeTicks);
        return (
          <EpisodeRow
            key={episode.id}
            id={episode.id}
            title={episode.title}
            {...(episode.episodeNumber !== undefined ? { number: episode.episodeNumber } : {})}
            {...(episode.subtitle ? { subtitle: episode.subtitle } : {})}
            {...(runtime ? { runtime } : {})}
            {...(episode.remainingTicks !== undefined ? { remainingTicks: episode.remainingTicks } : {})}
            {...(episode.progress !== undefined ? { progress: episode.progress } : {})}
            {...(episode.played ? { played: true } : {})}
            {...(episode.overview ? { overview: episode.overview } : {})}
            {...(art ? { image: { src: imageUrl(art, WIDE_IMAGE_WIDTH), ...(art.blurHash ? { blurHash: art.blurHash } : {}) } } : {})}
            href={playRoute(route)}
            onActivate={playActivation(route)}
            detailsHref={itemRoute(episode.id)}
          />
        );
      })}
    </EpisodeList>
  );
}
