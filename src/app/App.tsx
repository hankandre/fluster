import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FeatureIndex } from "../features";
import { NotFoundView } from "../features/not-found";
import { SignInView } from "../features/sign-in";
import { HomeView, refreshHomeRows } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { SearchView } from "../features/search";
import { ItemDetailView } from "../features/detail";
import { SettingsView } from "../features/settings";
import { SignedInChrome } from "../features/shell";
import { useTvArrowFallback } from "../features/shell/use-tv-arrow-fallback";
import { useBackspaceAsEscape } from "../features/shell/use-backspace-as-escape";
import { useFocusReturn } from "../features/shell/use-focus-return";
import { PlayerRouteView } from "../features/player";
import { type AppRoute, FEATURE_INDEX_ROUTE, GALLERY_ROUTE, HOME_ROUTE, isAppHash, isPlayerHash, parseAppRoute, ROUTE_REPLACED_EVENT, SIGN_IN_ROUTE } from "../features/routes";
import { markAccountDataStale, markKeptDataStaleForReturn } from "../features/query-scope";
import { resetAccountData } from "./account-data";
import { createServices, type AppServices } from "./compose";
import { PlayerServicesProvider, type PlayerServices } from "./player-services";
import { PreferencesProvider } from "./preferences";
import { SessionProvider, type SessionGateway } from "./session";
import { ToastProvider } from "../features/shared/ui";

// The UI gallery exists only in browser development. Vite replaces import.meta.env.DEV with false in a
// build, so the branch and the module behind it are dropped (scripts/check-no-test-engine.sh proves it).
const GalleryView = import.meta.env.DEV
  ? lazy(() => import("../features/gallery").then((module) => ({ default: module.GalleryView })))
  : undefined;

export function App() {
  const services = useMemo(() => createServices(), []);
  useBackspaceAsEscape();
  useFocusReturn();
  useTvArrowFallback();
  // One player engine for the whole app.
  const player = useMemo<PlayerServices>(
    () => ({
      engine: services.createPlayerEngine(),
      watchWindowClose: services.watchWindowClose,
      watchMediaControls: services.watchMediaControls,
    }),
    [services],
  );
  const preferences = useMemo(() => ({ streamingLimits: services.streamingLimits, continueWindow: services.continueWindow, skipModes: services.skipModes }), [services]);
  const queryClient = useQueryClient();
  const refreshRows = useCallback(() => {
    void refreshHomeRows(queryClient);
    markAccountDataStale(queryClient);
  }, [queryClient]);
  const onAccountChanged = useCallback((next: SessionGateway | undefined) => resetAccountData(queryClient, next), [queryClient]);
  // `visit` counts real navigations. A route replace (a sort or filter change) keeps it, so the screen is not remounted.
  const [{ hash, visit }, setRoute] = useState({ hash: window.location.hash, visit: 0 });

  // The app lives under its route prefix. Anything else, including an empty hash, goes
  // to Home, which sends a signed-out visitor on to sign-in.
  const inApp = isAppHash(hash);
  useEffect(() => {
    if (!inApp) window.location.replace(HOME_ROUTE);
  }, [inApp]);

  // Back and Forward show kept screens at once and refetch them in the background.
  useEffect(() => {
    const onPopState = () => markKeptDataStaleForReturn(queryClient);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [queryClient]);

  useEffect(() => {
    // A hashchange can arrive after a quick second navigation; it names the same hash then, and is not a visit.
    const onHashChange = () => setRoute((route) => (route.hash === window.location.hash ? route : { hash: window.location.hash, visit: route.visit + 1 }));
    const onReplaced = () => setRoute((route) => ({ ...route, hash: window.location.hash }));
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener(ROUTE_REPLACED_EVENT, onReplaced);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener(ROUTE_REPLACED_EVENT, onReplaced);
    };
  }, []);

  return (
    <ToastProvider suppressed={isPlayerHash(hash)}>
      <SessionProvider
        createGateway={services.createGateway}
        realtime={services.realtime}
        onServerDataChanged={refreshRows}
        onAccountChanged={onAccountChanged}
      >
        <PlayerServicesProvider services={player}>
          <PreferencesProvider preferences={preferences}>
            {!services.native && <BrowserModeLabel />}
            {inApp ? renderWithChrome(hash, visit, services) : null}
          </PreferencesProvider>
        </PlayerServicesProvider>
      </SessionProvider>
    </ToastProvider>
  );
}

function BrowserModeLabel() {
  return <p className="browser-mode-label" role="status">Browser development mode</p>;
}

// Which pages get the app nav. The player, sign-in, and developer pages do not.
function chromeFor(hash: string): "nav" | "none" {
  switch (hash) {
    case FEATURE_INDEX_ROUTE:
    case SIGN_IN_ROUTE:
    case GALLERY_ROUTE:
      return "none";
    default:
      return isPlayerHash(hash) ? "none" : "nav";
  }
}

function renderWithChrome(hash: string, visit: number, services: AppServices) {
  const route = parseAppRoute(hash);
  const page = route ? renderRoute(route, hash, visit, services) : <NotFoundView />;
  if (chromeFor(hash) === "none") return page;
  return <SignedInChrome hash={hash}>{page}</SignedInChrome>;
}

function renderRoute(route: AppRoute, hash: string, visit: number, services: AppServices) {
  switch (route.kind) {
    case "feature-index":
      return services.native ? <NotFoundView /> : <FeatureIndex />;
    case "sign-in":
      return <SignInView discovery={services.discovery} />;
    case "home":
      return <HomeView />;
    case "search":
      return <SearchView term={route.term} />;
    case "settings":
      return <SettingsView />;
    case "gallery":
      return GalleryView && !services.native ? <Suspense fallback={null}><GalleryView /></Suspense> : <NotFoundView />;
    case "play":
      return <PlayerRouteView key={hash} {...route} />;
    case "library":
      return <BrowseView key={`${route.libraryId}|${visit}`} libraryId={route.libraryId} sort={route.sort} filters={route.filters} />;
    case "collection":
      return <CollectionView key={`${route.collectionId}|${visit}`} collectionId={route.collectionId} sort={route.sort} filters={route.filters} />;
    case "item":
      return <ItemDetailView itemId={route.itemId} />;
    case "series":
      return <SeriesView seriesId={route.seriesId} />;
    default: {
      const unreachable: never = route;
      return unreachable;
    }
  }
}
