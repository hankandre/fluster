import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PocApp } from "../poc/PocApp";
import { FeatureIndex } from "../features";
import { NotFoundView } from "../features/not-found";
import { SignInView } from "../features/sign-in";
import { HomeView, refreshHomeRows } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { DetailView } from "../features/detail";
import { PlayerFeatureView } from "../features/player";
import type { PocServices } from "../poc/services";
import { createServices } from "./compose";
import { SessionProvider } from "./session";

export function App() {
  const services = useMemo(() => createServices(), []);
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
      {renderRoute(hash, services)}
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
    case "#/next/detail":
      return <DetailView />;
    case "#/next/player":
      return <PlayerFeatureView />;
    default:
      // Only a hash outside #/next shows the proof of concept.
      if (hash === "#/next" || hash.startsWith("#/next/")) return renderBrowseRoute(hash) ?? <NotFoundView />;
      return <PocApp services={services} />;
  }
}

// Browse routes carry an id: #/next/browse/<libraryId>, #/next/series/<id>, #/next/collection/<id>.
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
    case "series":
      return <SeriesView seriesId={itemId} />;
    case "collection":
      return <CollectionView collectionId={itemId} />;
    default:
      return undefined;
  }
}
