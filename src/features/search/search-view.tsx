import { BrowseFrame } from "../browse/browse-view";
import { SearchBox } from "./search-box";
import { SearchResults } from "./search-results";

// #/next/search shows the search field; #/next/search/<term> adds the results.
export function SearchView({ term: routeTerm }: { term?: string }) {
  // A blank term is the empty search page, not a search for spaces.
  const term = routeTerm?.trim() || undefined;
  return (
    <BrowseFrame title="Search" routeKey={`search/${term ?? ""}`} back={<a href="#/next">Back to features</a>}>
      {(gateway) => (
        <>
          <SearchBox gateway={gateway} initialTerm={term ?? ""} />
          {term ? <SearchResults gateway={gateway} term={term} /> : null}
        </>
      )}
    </BrowseFrame>
  );
}
