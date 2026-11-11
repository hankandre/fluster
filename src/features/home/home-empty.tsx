import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import type { SessionGateway } from "../../app/session";
import { ButtonLink, EmptyState } from "../shared/ui";

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

// The Home empty state (DESIGN.md 10). It asks the server for its name only when it is shown, through the
// unauthenticated probe; until that answers, or if it fails, the host stands in.
export function HomeEmpty({ gateway, scope }: { gateway: SessionGateway; scope: number }) {
  const server = useQuery({
    queryKey: ["home", scope, "server"],
    queryFn: ({ signal }) => gateway.connect(signal),
    gcTime: 0,
    retry: false,
  });
  const name = server.data?.name || hostOf(gateway.origin);

  return (
    <EmptyState
      icon={Clapperboard}
      title="Nothing to watch yet"
      action={<ButtonLink variant="primary" href="#/next/settings">Open settings</ButtonLink>}
    >
      {`Your libraries on ${name} don't have any movies or shows. Add media in Jellyfin, then come back.`}
    </EmptyState>
  );
}
