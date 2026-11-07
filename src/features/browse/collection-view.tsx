import { BrowseFrame } from "./browse-view";
import { LibraryGrid } from "./library-grid";

// A collection (BoxSet) is browsed like a library, with the collection as parent.
export function CollectionView({ collectionId }: { collectionId: string }) {
  return (
    <BrowseFrame title="Collection" back={<a href="#/next/browse">Back to libraries</a>}>
      {(gateway) => (
        <LibraryGrid gateway={gateway} parentId={collectionId} itemTypes={["Movie", "Series"]} label="Collection" />
      )}
    </BrowseFrame>
  );
}
