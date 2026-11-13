import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

// The server's name and version, shared by Account and About. It holds neither a token nor an address.
export function useServerInfo(gateway: SessionGateway) {
  return useQuery({
    queryKey: ["settings", scopeFor(gateway), "server"],
    queryFn: ({ signal }) => gateway.connect(signal),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
