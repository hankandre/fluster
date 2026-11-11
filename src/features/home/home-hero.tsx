import { useQuery } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { backdropWidth, heroArtFor, playActivation } from "../card-view";
import { cardRoute, playRoute } from "../routes";
import { Hero } from "../shared/ui";
import { heroFacts, primaryAction, type HeroEpisode } from "./hero-facts";

// The Home hero for one card: detail adds the overview and facts, and a series resolves its first episode.
// Both are optional; the hero renders from the card alone when they fail.
export function HomeHero({ card, gateway, scope }: { card: MediaCard; gateway: SessionGateway; scope: number }) {
  const detail = useQuery({
    queryKey: ["home", scope, "hero", card.id],
    queryFn: ({ signal }) => gateway.itemDetail(card.id, signal),
    gcTime: 0,
    retry: false,
  });
  const isSeries = card.kind === "Series";
  const episode = useQuery({
    queryKey: ["home", scope, "hero-episode", card.id],
    queryFn: async ({ signal }): Promise<HeroEpisode | null> => {
      const seasons = await gateway.seasons(card.id, signal);
      const season = seasons.find((candidate) => (candidate.indexNumber ?? 0) >= 1) ?? seasons[0];
      if (!season) return null;
      const [first] = await gateway.episodes(card.id, season.id, signal);
      if (!first) return null;
      return {
        id: first.id,
        seasonNumber: first.seasonNumber ?? season.indexNumber,
        episodeNumber: first.episodeNumber,
      };
    },
    enabled: isSeries,
    gcTime: 0,
    retry: false,
  });

  const action = primaryAction(card, episode.data ?? undefined);
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
      facts={heroFacts(card, detail.data)}
      overview={detail.data?.overview}
      detailPending={detail.isPending}
      primary={action ? { label: action.label, href: playRoute(action.route), onActivate: playActivation(action.route) } : undefined}
      primaryPending={isSeries && episode.isPending}
      moreInfoHref={cardRoute(card)}
    />
  );
}
