import type { UseQueryResult } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaRowItems, toPlayRowItems } from "../card-view";
import { MediaRow } from "../shared/ui";

interface HomeRowProps {
  title: string;
  query: UseQueryResult<MediaCard[]>;
  gateway: SessionGateway;
  // Continue watching and Next up: Enter plays and `i` opens details.
  playable?: boolean;
  // The id of the hidden sentence that explains `i`.
  hintId?: string;
  onItemFocus?(id: string): void;
  // The end-of-row "See all" tile (Latest rows only).
  seeAll?: { label: string; href: string };
}

// One home row, read from a query that useHomeData owns.
export function HomeRow({ title, query, gateway, playable = false, hintId, onItemFocus, seeAll }: HomeRowProps) {
  const status = query.isPending ? "pending" : query.isError ? "error" : "ready";
  const imageUrl = imageUrlFor(gateway);
  const variant = playable ? "thumb" : "poster";
  const items = query.isSuccess
    ? playable ? toPlayRowItems(query.data, imageUrl, hintId) : toMediaRowItems(query.data, variant, imageUrl)
    : undefined;

  return (
    <MediaRow
      title={title}
      variant={variant}
      status={status}
      items={items}
      onRetry={() => void query.refetch()}
      onItemFocus={onItemFocus}
      seeAll={seeAll}
    />
  );
}

export function RowError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="row-error" role="alert">
      <span>Could not load {title}.</span>
      <button type="button" className="text-button" onClick={onRetry}>Retry</button>
    </div>
  );
}
