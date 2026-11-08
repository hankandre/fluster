import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FeatureIndex } from "../features";
import { NotFoundView } from "../features/not-found";
import { SignInView } from "../features/sign-in";
import { HomeView, refreshHomeRows } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { SearchView } from "../features/search";
import { DetailView, ItemDetailView } from "../features/detail";
import { PlayerFeatureView, PlayerRouteView } from "../features/player";
import { parsePlayRoute } from "../features/routes";
import { createServices, type AppServices } from "./compose";
import { PlayerServicesProvider, type PlayerServices } from "./player-services";
import { SessionProvider } from "./session";

export function App() {
  const services = useMemo(() => createServices(), []);
  // One player engine for the whole app.
  const player = useMemo<PlayerServices>(
    () => ({
      engine: services.createPlayerEngine(),
      watchWindowClose: services.watchWindowClose,
      watchMediaControls: services.watchMediaControls,
    }),
    [services],
  );
  const queryClient = useQueryClient();
  const refreshRows = useCallback(() => void refreshHomeRows(queryClient), [queryClient]);
  const [hash, setHash] = useState(window.location.hash);

  // The app lives under #/next. Anything else, including an empty hash, goes
  // to Home, which sends a signed-out visitor on to sign-in.
  const inApp = isAppHash(hash);
  useEffect(() => {
    if (!inApp) window.location.replace(HOME_HASH);
  }, [inApp]);

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
      <PlayerServicesProvider services={player}>
        {!services.native && <BrowserModeLabel />}
        {inApp ? renderRoute(hash, services) : null}
      </PlayerServicesProvider>
    </SessionProvider>
  );
}

const HOME_HASH = "#/next/home";

function isAppHash(hash: string): boolean {
  return hash === "#/next" || hash.startsWith("#/next/");
}

function BrowserModeLabel() {
  return <p className="browser-mode-label" role="status">Browser development mode</p>;
}

function renderRoute(hash: string, services: AppServices) {
  switch (hash) {
    case "#/next":
      return <FeatureIndex />;
    case "#/next/sign-in":
      return <SignInView discovery={services.discovery} />;
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
      return renderBrowseRoute(hash) ?? <NotFoundView />;
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
