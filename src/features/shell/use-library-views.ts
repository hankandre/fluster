import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

// The signed-in user's libraries for the nav and for the genre links on a title's page. One key and one
// request, so the two cannot drift apart.
export function useLibraryViews(gateway: SessionGateway) {
  return useQuery({
    queryKey: ["nav", scopeFor(gateway), "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: 0,
  });
}
