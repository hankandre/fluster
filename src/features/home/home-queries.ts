import type { QueryClient } from "@tanstack/react-query";

// Home row keys are ["home", scope, row, ...]. Refetch every row except the
// library list, which watched state does not change.
export function refreshHomeRows(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: ["home"],
    predicate: (query) => query.queryKey[2] !== "views",
  });
}
