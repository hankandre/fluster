import { useEffect, useMemo, useState } from "react";
import { PocApp } from "../poc/PocApp";
import { FeatureIndex } from "../features";
import { SignInView } from "../features/sign-in";
import { HomeView } from "../features/home";
import { BrowseView, CollectionView, SeriesView } from "../features/browse";
import { DetailView } from "../features/detail";
import { PlayerFeatureView } from "../features/player";
import type { PocServices } from "../poc/services";
import { createServices } from "./compose";
import { SessionProvider } from "./session";

export function App() {
  const services = useMemo(() => createServices(), []);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <SessionProvider createGateway={services.createGateway}>
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
      return renderBrowseRoute(hash) ?? <PocApp services={services} />;
  }
}

// Browse routes carry an id: #/next/browse/<libraryId>, #/next/series/<id>, #/next/collection/<id>.
function renderBrowseRoute(hash: string) {
  const [root, next, section, id, ...extra] = hash.split("/");
  if (root !== "#" || next !== "next" || !id || extra.length > 0) return undefined;
  const itemId = decodeURIComponent(id);
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
