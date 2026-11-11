import { useQuery } from "@tanstack/react-query";
import { ItemNotFoundError } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { detailKey } from "../detail/detail-key";
import { ItemGoneNotice } from "../detail/detail-states";
import { useHeadingFocus } from "../detail/use-heading-focus";
import { InlineError } from "../shared/ui";
import { LibraryGrid } from "./library-grid";
import { LibraryPage } from "./library-page";
import { PendingTitle } from "./library-states";

// A collection (BoxSet) is browsed like a library, titled by its name, with the collection as parent.
export function CollectionView({ collectionId }: { collectionId: string }) {
  return (
    <LibraryPage>
      {(gateway) => <CollectionContent key={collectionId} gateway={gateway} collectionId={collectionId} />}
    </LibraryPage>
  );
}

function CollectionContent({ gateway, collectionId }: { gateway: SessionGateway; collectionId: string }) {
  const detail = useQuery({
    queryKey: detailKey(gateway, collectionId),
    queryFn: ({ signal }) => gateway.itemDetail(collectionId, signal),
    gcTime: 0,
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
