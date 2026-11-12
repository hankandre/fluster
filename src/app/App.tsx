import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FeatureIndex } from "../features";
import { NotFoundView } from "../features/not-found";
import { SignInView } from "../features/sign-in";
import { HomeView, refreshHomeRows } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { SearchView } from "../features/search";
import { DetailView, ItemDetailView } from "../features/detail";
import { SettingsView } from "../features/settings";
import { SignedInChrome } from "../features/shell";
import { PlayerFeatureView, PlayerRouteView } from "../features/player";
import { parseLibraryRoute, parsePlayRoute } from "../features/routes";
import { createServices, type AppServices } from "./compose";
import { PlayerServicesProvider, type PlayerServices } from "./player-services";
import { PreferencesProvider } from "./preferences";
import { SessionProvider } from "./session";
import { ToastProvider } from "../features/shared/ui";

// The UI gallery exists only in browser development. Vite replaces import.meta.env.DEV with false in a
// build, so the branch and the module behind it are dropped (scripts/check-no-test-engine.sh proves it).
const GalleryView = import.meta.env.DEV
  ? lazy(() => import("../features/gallery").then((module) => ({ default: module.GalleryView })))
  : undefined;

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
  const preferences = useMemo(() => ({ streamingLimits: services.streamingLimits }), [services]);
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
    <ToastProvider suppressed={isPlayerHash(hash)}>
      <SessionProvider
        createGateway={services.createGateway}
        realtime={services.realtime}
        onServerDataChanged={refreshRows}
      >
        <PlayerServicesProvider services={player}>
          <PreferencesProvider preferences={preferences}>
            {!services.native && <BrowserModeLabel />}
            {inApp ? renderWithChrome(hash, services) : null}
          </PreferencesProvider>
        </PlayerServicesProvider>
      </SessionProvider>
    </ToastProvider>
  );
}

const HOME_HASH = "#/next/home";

function isAppHash(hash: string): boolean {
  return hash === "#/next" || hash.startsWith("#/next/");
}

function BrowserModeLabel() {
  return <p className="browser-mode-label" role="status">Browser development mode</p>;
}

// Routes that show the player, where the OSD speaks and no toast shows. Add any new player route here.
function isPlayerHash(hash: string): boolean {
  return hash === "#/next/player" || hash.startsWith("#/next/play/");
}

// Which pages get the app nav. The player, sign-in, and developer pages do not.
function chromeFor(hash: string): "nav" | "none" {
  switch (hash) {
    case "#/next":
    case "#/next/sign-in":
    case "#/next/gallery":
      return "none";
    default:
      if (hash.startsWith("#/next/play/")) return "none";
      return "nav";
  }
}

function renderWithChrome(hash: string, services: AppServices) {
  const route = renderRoute(hash, services);
  if (chromeFor(hash) === "none") return route;
  return <SignedInChrome hash={hash}>{route}</SignedInChrome>;
}

function renderRoute(hash: string, services: AppServices) {
  switch (hash) {
    case "#/next":
      return services.native ? <NotFoundView /> : <FeatureIndex />;
    case "#/next/sign-in":
      return <SignInView discovery={services.discovery} />;
    case "#/next/home":
      return <HomeView />;
    case "#/next/search":
      return <SearchView />;
    case "#/next/detail":
      return <DetailView />;
    case "#/next/settings":
      return <SettingsView />;
    case "#/next/player":
      return <PlayerFeatureView />;
    case "#/next/gallery":
      return GalleryView && !services.native ? <Suspense fallback={null}><GalleryView /></Suspense> : <NotFoundView />;
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
  if (hash.startsWith("#/next/browse/")) {
    const route = parseLibraryRoute(hash);
    return route ? <BrowseView libraryId={route.libraryId} initialSort={route.sort} /> : undefined;
  }
  const [, , section, id, ...extra] = hash.split("/");
  if (!id || extra.length > 0) return undefined;
  let itemId: string;
  try {
    itemId = decodeURIComponent(id);
  } catch {
    return undefined;
  }
  switch (section) {
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
