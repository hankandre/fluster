import { useEffect } from "react";
import { useSession } from "../../app/session";
import { SearchBox } from "./search-box";
import { SearchResults } from "./search-results";
import { SearchStart } from "./search-states";
import { SIGN_IN_ROUTE } from "../routes";
import "./search.css";

// The search route shows the search field; the search route with a term adds the results.
// The view keeps its instance between the two routes, so the field keeps focus and its text.
export function SearchView({ term: routeTerm }: { term?: string }) {
  const { gateway } = useSession();
  // A blank term is the empty search page, not a search for spaces.
  const term = routeTerm?.trim() || undefined;

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="search-page">
      <h1 className="visually-hidden">Search</h1>
      {gateway ? (
        <>
          <SearchBox gateway={gateway} initialTerm={term ?? ""} />
          {term ? <SearchResults gateway={gateway} term={term} /> : <SearchStart />}
        </>
      ) : null}
    </main>
  );
}
