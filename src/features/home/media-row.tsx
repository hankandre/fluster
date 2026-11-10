import { useQuery } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor, toMediaRowItems } from "../card-view";
import { MediaRow, type MediaCardVariant } from "../shared/ui";

interface HomeRowProps {
  title: string;
  variant: MediaCardVariant;
  queryKey: readonly unknown[];
  load: (signal: AbortSignal) => Promise<MediaCard[]>;
  gateway: SessionGateway;
}

// One home row. It owns its query so all rows start loading together and
// fail on their own.
export function HomeRow({ title, variant, queryKey, load, gateway }: HomeRowProps) {
  const query = useQuery({ queryKey, queryFn: ({ signal }) => load(signal), gcTime: 0 });
  const status = query.isPending ? "pending" : query.isError ? "error" : "ready";

  return (
    <MediaRow
      title={title}
      variant={variant}
      status={status}
      items={query.isSuccess ? toMediaRowItems(query.data, variant, imageUrlFor(gateway)) : undefined}
      onRetry={() => void query.refetch()}
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
