export const SEARCH_ROUTE = "#/next/search";

export function searchResultsRoute(term: string): string {
  return `${SEARCH_ROUTE}/${encodeURIComponent(term)}`;
}

