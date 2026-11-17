import { useQuery } from "@tanstack/react-query";
import type { BrowseFilter, LibraryView } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { useHeadingFocus } from "../detail/use-heading-focus";
import { ACCOUNT_GC_TIME, scopeFor } from "../query-scope";
import { ButtonLink, InlineError, Notice } from "../shared/ui";
import { LibraryGrid } from "./library-grid";
import { LibraryPage } from "./library-page";
import { LibraryPagePending, PendingTitle } from "./library-states";
import { HOME_ROUTE, libraryRoute, replaceRoute } from "../routes";
import { DEFAULT_LIBRARY_SORT, type LibrarySortId } from "./library-sort";

// A library: its name as the page title, then the toolbar and the grid.
// The sort and filters are in the route, so Back and a copied link keep them.
export function BrowseView({ libraryId, sort, filters = [] }: { libraryId: string; sort?: LibrarySortId; filters?: BrowseFilter[] }) {
  return (
    <LibraryPage>
      {(gateway) => <LibraryContent key={libraryId} gateway={gateway} libraryId={libraryId} sort={sort} filters={filters} />}
    </LibraryPage>
  );
}

function LibraryContent({ gateway, libraryId, sort, filters }: { gateway: SessionGateway; libraryId: string; sort?: LibrarySortId; filters: BrowseFilter[] }) {
  const views = useQuery({
    queryKey: ["browse", scopeFor(gateway), "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: ACCOUNT_GC_TIME,
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
        actions={<ButtonLink variant="primary" href={HOME_ROUTE}>Go home</ButtonLink>}
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
        sortId={sort ?? DEFAULT_LIBRARY_SORT}
        filters={filters}
        onViewChange={(view) => replaceRoute(libraryRoute(libraryId, view.sortId, view.filters))}
      />
    </>
  );
}

function itemTypesFor(library: LibraryView): ("Movie" | "Series" | "BoxSet")[] {
  return library.collectionType === "boxsets" ? ["BoxSet"] : ["Movie", "Series"];
}
