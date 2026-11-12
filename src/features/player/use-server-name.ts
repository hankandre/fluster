import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { UNKNOWN_SERVER_NAME } from "./error-copy";

// The server's display name for error copy. It asks the server's public info
// only when `enabled`; after sign-in the request carries the session token to
// the same origin. Until that answers, or if it fails, the copy says "your
// server" and never an address.
export function useServerName(gateway: SessionGateway, enabled: boolean): string {
  const server = useQuery({
    queryKey: ["player", "server-name", gateway.origin],
    queryFn: ({ signal }) => gateway.connect(signal),
    enabled,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return server.data?.name || UNKNOWN_SERVER_NAME;
}
