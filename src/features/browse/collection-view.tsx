import { useQuery } from "@tanstack/react-query";
import { ItemNotFoundError, type BrowseFilter } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { ACCOUNT_GC_TIME } from "../query-scope";
import { detailKey } from "../detail/detail-key";
import { ItemGoneNotice } from "../detail/detail-states";
import { useHeadingFocus } from "../detail/use-heading-focus";
import { InlineError } from "../shared/ui";
import { collectionRoute, replaceRoute } from "../routes";
import { DEFAULT_LIBRARY_SORT, type LibrarySortId } from "./library-sort";
import { LibraryGrid } from "./library-grid";
import { LibraryPage } from "./library-page";
import { PendingTitle } from "./library-states";

// A collection (BoxSet) is browsed like a library, titled by its name, with the collection as parent.
export function CollectionView({ collectionId, sort, filters = [] }: { collectionId: string; sort?: LibrarySortId; filters?: BrowseFilter[] }) {
  return (
    <LibraryPage>
      {(gateway) => <CollectionContent key={collectionId} gateway={gateway} collectionId={collectionId} sort={sort} filters={filters} />}
    </LibraryPage>
  );
}

function CollectionContent({ gateway, collectionId, sort, filters }: { gateway: SessionGateway; collectionId: string; sort?: LibrarySortId; filters: BrowseFilter[] }) {
  const detail = useQuery({
    queryKey: detailKey(gateway, collectionId),
    queryFn: ({ signal }) => gateway.itemDetail(collectionId, signal),
    gcTime: ACCOUNT_GC_TIME,
  });
  const heading = useHeadingFocus(!detail.isPending);

  if (detail.error instanceof ItemNotFoundError) return <ItemGoneNotice headingRef={heading} />;

  const grid = (
    <LibraryGrid
      gateway={gateway}
      parentId={collectionId}
      itemTypes={["Movie", "Series"]}
      label={detail.data?.title ?? "Collection"}
      errorLabel="this collection"
      sortId={sort ?? DEFAULT_LIBRARY_SORT}
      filters={filters}
      onViewChange={(view) => replaceRoute(collectionRoute(collectionId, view.sortId, view.filters))}
    />
  );

  if (detail.isPending) {
    return (
      <>
        <PendingTitle headingRef={heading} name="Collection" />
        {grid}
      </>
    );
  }
  if (detail.isError) {
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className="visually-hidden">Collection</h1>
        <InlineError spatial message="Couldn't load this collection's name." onRetry={() => void detail.refetch()} />
        {grid}
      </>
    );
  }
  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="library-title">{detail.data.title}</h1>
      {grid}
    </>
  );
}
