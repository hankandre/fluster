import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession, type SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";
import { MediaRow } from "../shared/ui";
import { HomeRow } from "./media-row";

const SIGN_IN_ROUTE = "#/next/sign-in";

export function HomeView() {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="home">
      <h1>Home</h1>
      {gateway ? <HomeRows gateway={gateway} /> : null}
    </main>
  );
}

function HomeRows({ gateway }: { gateway: SessionGateway }) {
  const scope = scopeFor(gateway);

  return (
    <>
      <HomeRow
        title="Continue Watching"
        variant="thumb"
        queryKey={["home", scope, "resume"]}
        load={(signal) => gateway.resumeItems(signal)}
        gateway={gateway}
      />
      <HomeRow
        title="Next Up"
        variant="thumb"
        queryKey={["home", scope, "next-up"]}
        load={(signal) => gateway.nextUp(signal)}
        gateway={gateway}
      />
      <LatestRows gateway={gateway} scope={scope} />
    </>
  );
}

function LatestRows({ gateway, scope }: { gateway: SessionGateway; scope: number }) {
  const views = useQuery({
    queryKey: ["home", scope, "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: 0,
  });

  if (views.isPending) {
    return <MediaRow label="Latest" variant="poster" status="pending" />;
  }
  if (views.isError) {
    return <MediaRow label="Latest" variant="poster" status="error" errorMessage="Couldn't load your libraries." onRetry={() => void views.refetch()} />;
  }
  return (
    <>
      {views.data.map((view) => (
        <HomeRow
          key={view.id}
          title={`Latest in ${view.name}`}
          variant="poster"
          queryKey={["home", scope, "latest", view.id]}
          load={(signal) => gateway.latestInLibrary(view.id, signal)}
          gateway={gateway}
        />
      ))}
    </>
  );
}
