import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemNotFoundError } from "../../domain/catalog";
import { useSession, type SessionGateway } from "../../app/session";
import { backdropWidth } from "../card-view";
import { AmbientBackdrop } from "../shared/ambient-backdrop";
import { ButtonLink, InlineError, Notice, Skeleton } from "../shared/ui";
import { DetailBody, type ArtSource } from "./detail-body";
import { detailKey } from "./detail-key";
import { useHeadingFocus } from "./use-heading-focus";
import "./detail-page.css";

const SIGN_IN_ROUTE = "#/next/sign-in";

export function ItemDetailView({ itemId }: { itemId: string }) {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return <main className="detail-page">{gateway ? <ItemDetail gateway={gateway} itemId={itemId} /> : null}</main>;
}

// Stays mounted across item changes so the backdrop can crossfade between items.
function ItemDetail({ gateway, itemId }: { gateway: SessionGateway; itemId: string }) {
  const [art, setArt] = useState<ArtSource | undefined>();
  return (
    <AmbientBackdrop
      imageKey={art?.key ?? "none"}
      src={art?.image ? gateway.imageUrl(art.image.itemId, art.image.type, art.image.tag, backdropWidth()) : undefined}
      blurHash={art?.blurHash}
    >
      <ItemDetailContent key={itemId} gateway={gateway} itemId={itemId} onArt={setArt} />
    </AmbientBackdrop>
  );
}

function ItemDetailContent({ gateway, itemId, onArt }: { gateway: SessionGateway; itemId: string; onArt: (art: ArtSource | undefined) => void }) {
  const query = useQuery({
    queryKey: detailKey(gateway, itemId),
    queryFn: ({ signal }) => gateway.itemDetail(itemId, signal),
    gcTime: 0,
  });
  const heading = useHeadingFocus(!query.isPending);

  if (query.isPending) return <DetailSkeleton />;
  if (query.error instanceof ItemNotFoundError) {
    return (
      <Notice
        title="This item is no longer on the server"
        headingRef={heading}
        actions={<ButtonLink variant="primary" href="#/next/home">Go home</ButtonLink>}
      >
        It may have been removed or renamed.
      </Notice>
    );
  }
  if (query.isError) {
    return (
      <div className="detail-state">
        <h1 ref={heading} tabIndex={-1} className="visually-hidden">Couldn't load this item</h1>
        <InlineError message="Couldn't load this item." onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <DetailBody gateway={gateway} item={query.data} onArt={onArt} headingRef={heading} />;
}

// Shaped like the header: a title block, a facts line, and two controls.
function DetailSkeleton() {
  return (
    <header className="detail-header" aria-busy="true">
      <div className="detail-text">
        <h1 className="visually-hidden">Loading details</h1>
        <Skeleton shape="block" width="min(360px, 100%)" height="var(--space-8)" />
        <Skeleton shape="line" width="min(240px, 100%)" />
        <div className="detail-skeleton-actions">
          <Skeleton shape="block" width="160px" height="var(--control-h)" />
          <Skeleton shape="block" width="160px" height="var(--control-h)" />
        </div>
      </div>
    </header>
  );
}
