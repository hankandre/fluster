import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isTvForm } from "../shared/tv-form";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, type SessionGateway } from "../../app/session";
import type { ImageRef, MediaCard } from "../../domain/catalog";
import { backdropWidth, heroArtFor } from "../card-view";
import { AmbientBackdrop } from "../shared/ambient-backdrop";
import { Hero, MediaRow } from "../shared/ui";
import { detailKey } from "../detail/detail-key";
import { libraryRoute } from "../routes";
import { HomeEmpty } from "./home-empty";
import { HomeHero } from "./home-hero";
import { isHomeEmpty, useHomeData } from "./home-data";
import { pickHero } from "./hero-pick";
import { HomeRow } from "./media-row";
import { useFocusDwell } from "./use-focus-dwell";
import "./home.css";

const SIGN_IN_ROUTE = "#/next/sign-in";
const AMBIENT_DWELL_MS = 300;
const AMBIENT_STRENGTH = 0.35;
const PREFETCH_MS = 30_000;

export function HomeView() {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="home-page">
      <h1 className="visually-hidden">Home</h1>
      {gateway ? <HomeContent gateway={gateway} /> : null}
    </main>
  );
}

function HomeContent({ gateway }: { gateway: SessionGateway }) {
  const hintId = useId();
  const data = useHomeData(gateway);
  const { scope, resume, nextUp, views, latest } = data;
  const hero = pickHero(resume, nextUp, views, latest.map(({ query }) => query));
  const empty = isHomeEmpty(data);

  // Focus rests on a card for 300 ms before the ambient art follows it (DESIGN.md 9).
  const schedule = useFocusDwell(AMBIENT_DWELL_MS);
  const [focused, setFocused] = useState<MediaCard | undefined>();
  const cards = useMemo(() => {
    const byId = new Map<string, MediaCard>();
    const lists = [resume.data, nextUp.data, ...latest.map(({ query }) => query.data)];
    for (const list of lists) for (const card of list ?? []) if (!byId.has(card.id)) byId.set(card.id, card);
    return byId;
  }, [resume.data, nextUp.data, latest]);
  const queryClient = useQueryClient();
  // After the same dwell, a Movie or Episode card's detail is fetched so opening it is instant (DESIGN.md 9).
  // A Series card leads to the series page, so it is not prefetched.
  const onItemFocus = (id: string) => {
    const card = cards.get(id);
    if (!card) return;
    schedule(() => {
      setFocused(card);
      if (card.kind === "Movie" || card.kind === "Episode") {
        void queryClient.prefetchQuery({
          queryKey: detailKey(gateway, card.id),
          queryFn: ({ signal }) => gateway.itemDetail(card.id, signal),
          staleTime: PREFETCH_MS,
          gcTime: PREFETCH_MS,
        });
      }
    });
  };

  // TV form with no hero: the first card of the first row takes focus (DESIGN.md 9).
  const focusedFirstCard = useRef(false);
  useEffect(() => {
    if (!isTvForm() || hero.status !== "none" || empty || focusedFirstCard.current) return;
    const first = document.querySelector<HTMLElement>(".home-rows [data-roving-item]");
    const active = document.activeElement;
    if (!first || (active && active !== document.body && !active.matches("h1, main") && !active.closest('nav[aria-label="Main"]'))) return;
    focusedFirstCard.current = true;
    first.focus();
  });

  const ambientCard = focused ?? (hero.status === "ready" ? hero.card : undefined);
  const art: ImageRef | undefined = ambientCard ? heroArtFor(ambientCard) : undefined;

  return (
    <AmbientBackdrop
      imageKey={ambientCard ? `${ambientCard.id}/${art?.tag ?? "none"}` : "none"}
      src={art ? gateway.imageUrl(art.itemId, art.type, art.tag, backdropWidth()) : undefined}
      blurHash={art?.blurHash}
      strength={AMBIENT_STRENGTH}
    >
      <p id={hintId} className="visually-hidden">Enter plays. Press i for details.</p>
      {hero.status === "ready" ? <HomeHero key={hero.card.id} card={hero.card} gateway={gateway} scope={scope} /> : null}
      {hero.status === "pending" ? <Hero title="" pending /> : null}
      <div className="home-rows" data-hero={hero.status === "ready" || hero.status === "pending" ? "true" : "false"}>
        {empty ? (
          <HomeEmpty gateway={gateway} scope={scope} />
        ) : (
          <>
            <HomeRow title="Continue watching" query={resume} gateway={gateway} playable hintId={hintId} onItemFocus={onItemFocus} />
            <HomeRow title="Next up" query={nextUp} gateway={gateway} playable hintId={hintId} onItemFocus={onItemFocus} />
            {views.isPending ? <MediaRow label="Latest" variant="poster" status="pending" /> : null}
            {views.isError ? (
              <MediaRow label="Latest" variant="poster" status="error" errorMessage="Couldn't load your libraries." onRetry={() => void views.refetch()} />
            ) : null}
            {latest.map(({ view, query }) => (
              <HomeRow
                key={view.id}
                title={`Latest in ${view.name}`}
                query={query}
                gateway={gateway}
                onItemFocus={onItemFocus}
                seeAll={{ label: `See all in ${view.name}`, href: libraryRoute(view.id, "added-desc") }}
              />
            ))}
          </>
        )}
      </div>
    </AmbientBackdrop>
  );
}
