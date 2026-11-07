import { useQuery } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { CardImage, CARD_IMAGE_WIDTH } from "./card-image";

const SKELETON_COUNT = 6;

interface MediaRowProps {
  title: string;
  queryKey: readonly unknown[];
  load: (signal: AbortSignal) => Promise<MediaCard[]>;
  gateway: SessionGateway;
}

// One home row. It owns its query so all rows start loading together and
// fail on their own.
export function MediaRow({ title, queryKey, load, gateway }: MediaRowProps) {
  const query = useQuery({ queryKey, queryFn: ({ signal }) => load(signal), gcTime: 0 });
  const headingId = `row-${queryKey.join("-")}`;

  if (query.isSuccess && query.data.length === 0) return null;

  return (
    <section className="home-row" aria-labelledby={headingId} aria-busy={query.isPending}>
      <h2 id={headingId}>{title}</h2>
      {query.isPending ? <SkeletonStrip /> : null}
      {query.isError ? <RowError title={title} onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess ? (
        <ul className="card-strip">
          {query.data.map((card) => (
            <li key={card.id}>
              <Card card={card} gateway={gateway} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
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

export function SkeletonStrip() {
  return (
    <ul className="card-strip" aria-hidden="true">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <li key={index} className="card-skeleton" data-testid="card-skeleton" />
      ))}
    </ul>
  );
}

function Card({ card, gateway }: { card: MediaCard; gateway: SessionGateway }) {
  const { image } = card;
  const src = image ? gateway.imageUrl(image.itemId, image.type, image.tag, CARD_IMAGE_WIDTH) : undefined;
  const label = card.subtitle ? `${card.title}, ${card.subtitle}` : card.title;

  return (
    <button type="button" className="media-card-button" aria-label={label}>
      <div className="card-art" style={{ aspectRatio: card.aspectRatio }}>
        <CardImage image={image} src={src} />
        {card.progress !== undefined ? (
          <div
            className="card-progress"
            role="progressbar"
            aria-label="Watched"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(card.progress * 100)}
          >
            <div style={{ width: `${card.progress * 100}%` }} />
          </div>
        ) : null}
      </div>
      <span className="card-title">{card.title}</span>
      {card.subtitle ? <span className="card-subtitle">{card.subtitle}</span> : null}
    </button>
  );
}
