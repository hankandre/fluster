import { useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LibraryView } from "../../domain/catalog";
import { useSession, type SessionGateway } from "../../app/session";
import { RowError } from "../home/media-row";
import { scopeFor } from "../query-scope";
import { SignOutButton } from "../sign-out-button";
import { LibraryGrid } from "./library-grid";

const SIGN_IN_ROUTE = "#/next/sign-in";

// Shared page frame for browse routes. Signed-out visitors go to sign-in.
export function BrowseFrame({ title, routeKey, back, children }: { title: string; routeKey: string; back: ReactNode; children: (gateway: SessionGateway) => ReactNode }) {
  const { gateway } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the page heading when the route changes.
  useEffect(() => {
    heading.current?.focus();
  }, [routeKey]);

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="home">
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      {gateway ? children(gateway) : null}
      {back}
      <SignOutButton />
    </main>
  );
}

export function BrowseView({ libraryId }: { libraryId?: string }) {
  return (
    <BrowseFrame
      title="Browse"
      routeKey={`browse/${libraryId ?? ""}`}
      back={<a href={libraryId ? "#/next/browse" : "#/next"}>{libraryId ? "Back to libraries" : "Back to features"}</a>}
    >
      {(gateway) => <Libraries gateway={gateway} libraryId={libraryId} />}
    </BrowseFrame>
  );
}

function Libraries({ gateway, libraryId }: { gateway: SessionGateway; libraryId?: string }) {
  const views = useQuery({
    queryKey: ["browse", scopeFor(gateway), "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: 0,
  });

  if (views.isPending) return <p aria-busy="true">Loading libraries…</p>;
  if (views.isError) return <RowError title="your libraries" onRetry={() => void views.refetch()} />;

  if (libraryId === undefined) {
    return (
      <ul className="library-list">
        {views.data.map((view) => (
          <li key={view.id}>
            <a href={`#/next/browse/${encodeURIComponent(view.id)}`}>{view.name}</a>
          </li>
        ))}
      </ul>
    );
  }

  const library = views.data.find((view) => view.id === libraryId);
  if (!library) return <p role="alert">That library was not found.</p>;
  return (
    <>
      <h2>{library.name}</h2>
      <LibraryGrid
        gateway={gateway}
        parentId={library.id}
        itemTypes={itemTypesFor(library)}
        label={library.name}
      />
    </>
  );
}

function itemTypesFor(library: LibraryView): ("Movie" | "Series" | "BoxSet")[] {
  return library.collectionType === "boxsets" ? ["BoxSet"] : ["Movie", "Series"];
}
