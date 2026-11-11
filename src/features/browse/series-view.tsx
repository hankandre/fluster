import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemNotFoundError } from "../../domain/catalog";
import { useSession, type SessionGateway } from "../../app/session";
import { DetailBackdrop } from "../detail/detail-backdrop";
import type { ArtSource } from "../detail/art-source";
import { detailKey } from "../detail/detail-key";
import { DetailLoadError, DetailSkeleton, ItemGoneNotice } from "../detail/detail-states";
import { useHeadingFocus } from "../detail/use-heading-focus";
import "../detail/detail-page.css";
import { SeriesBody } from "./series-body";
import "./series.css";

const SIGN_IN_ROUTE = "#/next/sign-in";

// The series page (DESIGN.md 7.7): the name or Logo over the backdrop, the next episode to play, then the seasons.
export function SeriesView({ seriesId }: { seriesId: string }) {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="detail-page">
      {gateway ? (
        <DetailBackdrop gateway={gateway}>
          {(onArt) => <SeriesContent key={seriesId} gateway={gateway} seriesId={seriesId} onArt={onArt} />}
        </DetailBackdrop>
      ) : null}
    </main>
  );
}

function SeriesContent({ gateway, seriesId, onArt }: { gateway: SessionGateway; seriesId: string; onArt: (art: ArtSource | undefined) => void }) {
  const query = useQuery({
    queryKey: detailKey(gateway, seriesId),
    queryFn: ({ signal }) => gateway.itemDetail(seriesId, signal),
    gcTime: 0,
  });
  const heading = useHeadingFocus(!query.isPending);

  if (query.isPending) return <DetailSkeleton controls={1} />;
  if (query.error instanceof ItemNotFoundError) return <ItemGoneNotice headingRef={heading} />;
  if (query.isError) return <DetailLoadError headingRef={heading} onRetry={() => void query.refetch()} />;
  return <SeriesBody gateway={gateway} item={query.data} onArt={onArt} headingRef={heading} />;
}
