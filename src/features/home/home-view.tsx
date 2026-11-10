import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession, type SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";
import { MediaRow, RowError, SkeletonStrip } from "./media-row";

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
      <MediaRow
        title="Continue Watching"
        queryKey={["home", scope, "resume"]}
        load={(signal) => gateway.resumeItems(signal)}
        gateway={gateway}
      />
      <MediaRow
        title="Next Up"
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
    return (
      <section className="home-row" aria-busy="true" aria-label="Latest">
        <SkeletonStrip />
      </section>
    );
  }
  if (views.isError) {
    return (
      <section className="home-row">
        <RowError title="your libraries" onRetry={() => void views.refetch()} />
      </section>
    );
  }
  return (
    <>
      {views.data.map((view) => (
        <MediaRow
          key={view.id}
          title={`Latest in ${view.name}`}
          queryKey={["home", scope, "latest", view.id]}
          load={(signal) => gateway.latestInLibrary(view.id, signal)}
          gateway={gateway}
        />
      ))}
    </>
  );
}
