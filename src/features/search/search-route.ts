export const SEARCH_ROUTE = "#/next/search";

export function searchResultsRoute(term: string): string {
  return `${SEARCH_ROUTE}/${encodeURIComponent(term)}`;
}

export function seriesRoute(id: string): string {
  return `#/next/series/${encodeURIComponent(id)}`;
}
