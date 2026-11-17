import { useQuery } from "@tanstack/react-query";
import { ItemNotFoundError } from "../../domain/catalog";
import { useSession, type SessionGateway } from "../../app/session";
import { ACCOUNT_GC_TIME } from "../query-scope";
import type { ArtSource } from "./art-source";
import { DetailBody } from "./detail-body";
import { DetailBackdrop } from "./detail-backdrop";
import { detailKey } from "./detail-key";
import { DetailLoadError, DetailSkeleton, ItemGoneNotice } from "./detail-states";
import { useHeadingFocus } from "./use-heading-focus";
import "./detail-page.css";

export function ItemDetailView({ itemId }: { itemId: string }) {
  const { gateway } = useSession();

  return (
    <main className="detail-page">
      {gateway ? (
        <DetailBackdrop gateway={gateway}>
          {(onArt) => <ItemDetailContent key={itemId} gateway={gateway} itemId={itemId} onArt={onArt} />}
        </DetailBackdrop>
      ) : null}
    </main>
  );
}

function ItemDetailContent({ gateway, itemId, onArt }: { gateway: SessionGateway; itemId: string; onArt: (art: ArtSource | undefined) => void }) {
  const query = useQuery({
    queryKey: detailKey(gateway, itemId),
    queryFn: ({ signal }) => gateway.itemDetail(itemId, signal),
    gcTime: ACCOUNT_GC_TIME,
  });
  const heading = useHeadingFocus(!query.isPending);

  if (query.isPending) return <DetailSkeleton />;
  if (query.error instanceof ItemNotFoundError) return <ItemGoneNotice headingRef={heading} />;
  if (query.isError) return <DetailLoadError headingRef={heading} onRetry={() => void query.refetch()} />;
  return <DetailBody gateway={gateway} item={query.data} onArt={onArt} headingRef={heading} />;
}
