import type { Ref } from "react";
import type { SessionGateway } from "../../app/session";
import type { ItemDetail } from "../../domain/catalog";
import { imageUrlFor, playActivation } from "../card-view";
import type { ArtSource } from "../detail/art-source";
import { Overview } from "../detail/overview";
import { useHeaderArt } from "../detail/use-header-art";
import { playRoute } from "../routes";
import { ActionBar, ButtonLink, DetailHeader, InlineError, ProgressRing, Skeleton } from "../shared/ui";
import { initialSeason, orderSeasons, seriesPrimary, type SeriesPrimary } from "./series-next";
import { seriesFacts } from "./series-facts";
import { useSeasonEpisodes, useSeriesNextUp, useSeriesSeasons } from "./series-queries";
import { SeriesSeasons } from "./series-seasons";

interface SeriesBodyProps {
  gateway: SessionGateway;
  item: ItemDetail;
  onArt(art: ArtSource | undefined): void;
  headingRef: Ref<HTMLHeadingElement>;
}

// The loaded page: the header with its one Play or Resume action, then the seasons and their episodes.
export function SeriesBody({ gateway, item, onArt, headingRef }: SeriesBodyProps) {
  const { inlineArt } = useHeaderArt(item, gateway, onArt);
  const imageUrl = imageUrlFor(gateway);
  const seasons = useSeriesSeasons(gateway, item.id);
  const nextUp = useSeriesNextUp(gateway, item.id);

  // Without a next episode from the server, the first episode of the season that would open is offered.
  const fallbackSeason = seasons.data ? initialSeason(orderSeasons(seasons.data), undefined) : undefined;
  const needsFallback = nextUp.isSuccess && nextUp.data === null;
  const fallback = useSeasonEpisodes(gateway, item.id, fallbackSeason?.id, needsFallback);

  let pending: boolean;
  let primary: SeriesPrimary | undefined;
  if (nextUp.isPending) {
    pending = true;
  } else if (nextUp.isError) {
    pending = false;
  } else if (nextUp.data) {
    pending = false;
    primary = seriesPrimary(nextUp.data, undefined);
  } else {
    pending = seasons.isPending || (fallbackSeason !== undefined && fallback.isPending);
    primary = seriesPrimary(undefined, fallback.data?.[0], fallbackSeason);
  }

  const actions = pending
    ? <Skeleton shape="block" width="var(--skeleton-action-w)" height="var(--control-h)" />
    : primary
      ? <SeriesActions primary={primary} />
      : null;
  const notice = nextUp.isError
    ? <InlineError spatial message="Couldn't load your next episode." onRetry={() => void nextUp.refetch()} />
    : undefined;

  return (
    <>
      <DetailHeader
        title={item.title}
        logo={item.logo ? { src: imageUrl(item.logo, 800) } : undefined}
        facts={seriesFacts(item, seasons.data)}
        actions={actions}
        notice={notice}
        overview={item.overview ? <Overview text={item.overview} /> : undefined}
        inlineArt={inlineArt}
        headingRef={headingRef}
      />
      <div className="detail-body">
        <SeriesSeasons gateway={gateway} seriesId={item.id} />
      </div>
    </>
  );
}

// Plays the next episode in one activation (a click or Enter opens the player). No confirm step.
function SeriesActions({ primary }: { primary: SeriesPrimary }) {
  return (
    <ActionBar>
      <ButtonLink
        variant="primary"
        href={playRoute(primary.route)}
        onClick={playActivation(primary.route)}
        data-roving-item=""
        icon={primary.progress !== undefined ? <ProgressRing value={primary.progress} /> : undefined}
      >
        {primary.label}
      </ButtonLink>
    </ActionBar>
  );
}
