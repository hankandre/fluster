import { QueryClient } from "@tanstack/react-query";

// The one query cache of the app. It lives in memory only and has no persister, so closing the app drops it.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
