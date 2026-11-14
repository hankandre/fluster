import { useQuery } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { ACCOUNT_GC_TIME } from "../query-scope";
import { backdropWidth, heroArtFor, playActivation } from "../card-view";
import { cardRoute, playRoute } from "../routes";
import { Hero } from "../shared/ui";
import { fallbackSeasonOf, seriesPrimaryState } from "../browse/series-next";
import { heroFacts, primaryAction } from "./hero-facts";

// The Home hero for one card: detail adds the overview and facts, and a series resolves the episode its series page would offer.
// Both are optional; the hero renders from the card alone when they fail.
export function HomeHero({ card, gateway, scope }: { card: MediaCard; gateway: SessionGateway; scope: number }) {
  const detail = useQuery({
    queryKey: ["home", scope, "hero", card.id],
    queryFn: ({ signal }) => gateway.itemDetail(card.id, signal),
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });
  const isSeries = card.kind === "Series";
  // A series offers what its series page offers: Next Up, else the first episode of the season that would open.
  const nextUp = useQuery({
    queryKey: ["home", scope, "hero-next-up", card.id],
    queryFn: async ({ signal }) => (await gateway.seriesNextUp(card.id, signal)) ?? null,
    enabled: isSeries,
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });
  const needsFallback = nextUp.isSuccess && nextUp.data === null;
  const seasons = useQuery({
    queryKey: ["home", scope, "hero-seasons", card.id],
    queryFn: ({ signal }) => gateway.seasons(card.id, signal),
    enabled: isSeries && needsFallback,
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });
  const fallbackSeason = fallbackSeasonOf(seasons.data);
  const fallback = useQuery({
    queryKey: ["home", scope, "hero-episodes", card.id, fallbackSeason?.id ?? ""],
    queryFn: ({ signal }) => gateway.episodes(card.id, fallbackSeason!.id, signal),
    enabled: isSeries && needsFallback && fallbackSeason !== undefined,
    gcTime: ACCOUNT_GC_TIME,
    retry: false,
  });

  const series = isSeries
    ? seriesPrimaryState(
      { status: nextUp.status, data: nextUp.data },
      { status: seasons.status, data: seasons.data },
      { status: fallback.status, data: fallback.data },
    )
    : undefined;
  const action = series ? series.primary : primaryAction(card);
  const progress = series
    ? series.primary?.progress
    : action && action.route.startTicks > 0 ? card.progress : undefined;
  const art = heroArtFor(card);
  const logo = card.logo;

  return (
    <Hero
      title={card.title}
      logo={logo ? { src: gateway.imageUrl(logo.itemId, logo.type, logo.tag, 800) } : undefined}
      art={art ? {
        src: gateway.imageUrl(art.itemId, art.type, art.tag, backdropWidth()),
        ...(art.blurHash ? { blurHash: art.blurHash } : {}),
      } : undefined}
      facts={heroFacts(card, detail.data, series?.primary?.numbering)}
      overview={detail.data?.overview}
      detailPending={detail.isPending}
      primary={action ? {
        label: action.label,
        href: playRoute(action.route),
        onActivate: playActivation(action.route),
        ...(progress !== undefined ? { progress } : {}),
      } : undefined}
      primaryPending={series?.pending ?? false}
      moreInfoHref={cardRoute(card)}
    />
  );
}
