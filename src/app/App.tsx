import { useEffect, useMemo, useState } from "react";
import { PocApp } from "../poc/PocApp";
import { FeatureIndex } from "../features";
import { SignInView } from "../features/sign-in";
import { HomeView } from "../features/home";
import { BrowseView } from "../features/browse";
import { DetailView } from "../features/detail";
import { PlayerFeatureView } from "../features/player";
import { createServices } from "./compose";

export function App() {
  const services = useMemo(() => createServices(), []);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
      return <PocApp services={services} />;
  }
}
