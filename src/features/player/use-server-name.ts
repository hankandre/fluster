import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { UNKNOWN_SERVER_NAME } from "./error-copy";

// The server's display name for error copy. It asks the unauthenticated probe
// only when `enabled`; until that answers, or if it fails, the copy says
// "your server" and never an address.
export function useServerName(gateway: SessionGateway, enabled: boolean): string {
  const server = useQuery({
    queryKey: ["player", "server-name", gateway.origin],
    queryFn: ({ signal }) => gateway.connect(signal),
    enabled,
    gcTime: 0,
    retry: false,
  });
  return server.data?.name || UNKNOWN_SERVER_NAME;
}
