import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PocApp } from "../poc/PocApp";
import { FeatureIndex } from "../features";
import { NotFoundView } from "../features/not-found";
import { SignInView } from "../features/sign-in";
import { HomeView, refreshHomeRows } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { SearchView } from "../features/search";
import { DetailView, ItemDetailView } from "../features/detail";
import { PlayerFeatureView, PlayerRouteView } from "../features/player";
import { parsePlayRoute } from "../features/routes";
import type { PocServices } from "../poc/services";
import { createServices } from "./compose";
import { PlayerServicesProvider, type PlayerServices } from "./player-services";
import { SessionProvider } from "./session";

export function App() {
  const services = useMemo(() => createServices(), []);
  // One player engine for the whole app, shared by the new UI and the proof of concept.
  const player = useMemo<PlayerServices>(
    () => ({ engine: services.createPlayerEngine(), watchWindowClose: services.watchWindowClose }),
    [services],
  );
  const pocServices = useMemo<PocServices>(
    () => ({ ...services, createPlayerEngine: () => player.engine }),
    [services, player],
  );
  const queryClient = useQueryClient();
  const refreshRows = useCallback(() => void refreshHomeRows(queryClient), [queryClient]);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <SessionProvider
      createGateway={services.createGateway}
      realtime={services.realtime}
      onServerDataChanged={refreshRows}
    >
      <PlayerServicesProvider services={player}>{renderRoute(hash, pocServices)}</PlayerServicesProvider>
    </SessionProvider>
  );
}

function renderRoute(hash: string, services: PocServices) {
  switch (hash) {
    case "#/next":
      return <FeatureIndex />;
    case "#/next/sign-in":
      return <SignInView />;
    case "#/next/home":
      return <HomeView />;
    case "#/next/browse":
      return <BrowseView />;
    case "#/next/search":
      return <SearchView />;
    case "#/next/detail":
      return <DetailView />;
    case "#/next/player":
      return <PlayerFeatureView />;
    default:
      if (hash.startsWith("#/next/play/")) return renderPlayRoute(hash);
      // Only a hash outside #/next shows the proof of concept.
      if (hash === "#/next" || hash.startsWith("#/next/")) return renderBrowseRoute(hash) ?? <NotFoundView />;
      return <PocApp services={services} />;
  }
}

// #/next/play/<itemId>?source=<mediaSourceId>&start=<ticks>
function renderPlayRoute(hash: string) {
  const route = parsePlayRoute(hash);
  if (!route) return <NotFoundView />;
  return <PlayerRouteView key={hash} {...route} />;
}

// Routes with an id: #/next/browse/<libraryId>, #/next/item/<id>, #/next/series/<id>, #/next/collection/<id>,
// and #/next/search/<term>.
// Anything else, including malformed ids, is not found.
function renderBrowseRoute(hash: string) {
  const [, , section, id, ...extra] = hash.split("/");
  if (!id || extra.length > 0) return undefined;
  let itemId: string;
  try {
    itemId = decodeURIComponent(id);
  } catch {
    return undefined;
  }
  switch (section) {
    case "browse":
      return <BrowseView libraryId={itemId} />;
    case "item":
      return <ItemDetailView itemId={itemId} />;
    case "series":
      return <SeriesView seriesId={itemId} />;
    case "search":
      return <SearchView term={itemId} />;
    case "collection":
      return <CollectionView collectionId={itemId} />;
    default:
      return undefined;
  }
}
