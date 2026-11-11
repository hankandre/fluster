import { useQuery } from "@tanstack/react-query";
import type { LibraryView } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { useHeadingFocus } from "../detail/use-heading-focus";
import { scopeFor } from "../query-scope";
import { ButtonLink, InlineError, Notice } from "../shared/ui";
import { LibraryGrid } from "./library-grid";
import { LibraryPage } from "./library-page";
import { LibraryPagePending, PendingTitle } from "./library-states";
import type { LibrarySortId } from "./library-sort";

// A library: its name as the page title, then the toolbar and the grid.
export function BrowseView({ libraryId, initialSort }: { libraryId: string; initialSort?: LibrarySortId }) {
  return (
    <LibraryPage>
      {(gateway) => <LibraryContent key={`${libraryId}/${initialSort ?? ""}`} gateway={gateway} libraryId={libraryId} initialSort={initialSort} />}
    </LibraryPage>
  );
}

function LibraryContent({ gateway, libraryId, initialSort }: { gateway: SessionGateway; libraryId: string; initialSort?: LibrarySortId }) {
  const views = useQuery({
    queryKey: ["browse", scopeFor(gateway), "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: 0,
  });
  const library = views.data?.find((view) => view.id === libraryId);
  const heading = useHeadingFocus(!views.isPending);

  if (views.isPending) {
    return (
      <>
        <PendingTitle headingRef={heading} name="Library" />
        <LibraryPagePending />
      </>
    );
  }
  if (views.isError) {
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className="visually-hidden">Library</h1>
        <InlineError spatial message="Couldn't load your libraries." onRetry={() => void views.refetch()} />
      </>
    );
  }
  if (!library) {
    return (
      <Notice
        title="This library isn't available"
        headingRef={heading}
        actions={<ButtonLink variant="primary" href="#/next/home">Go home</ButtonLink>}
      >
        It may have been removed, or this account can't see it.
      </Notice>
    );
  }
  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="library-title">{library.name}</h1>
      <LibraryGrid
        gateway={gateway}
        parentId={library.id}
        itemTypes={itemTypesFor(library)}
        label={library.name}
        initialSort={initialSort}
      />
    </>
  );
}

function itemTypesFor(library: LibraryView): ("Movie" | "Series" | "BoxSet")[] {
  return library.collectionType === "boxsets" ? ["BoxSet"] : ["Movie", "Series"];
}
