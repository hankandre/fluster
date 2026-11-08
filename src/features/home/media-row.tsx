import { useQuery } from "@tanstack/react-query";
import type { MediaCard } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { useRovingFocus } from "../roving-focus";
import { cardRoute } from "../routes";
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
  const roving = useRovingFocus<HTMLUListElement>("row");

  if (query.isSuccess && query.data.length === 0) return null;

  return (
    <section className="home-row" aria-labelledby={headingId} aria-busy={query.isPending}>
      <h2 id={headingId}>{title}</h2>
      {query.isPending ? <SkeletonStrip /> : null}
      {query.isError ? <RowError title={title} onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess ? (
        <ul className="card-strip" {...roving}>
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

// A card of a known kind is a real link, so keyboard and screen-reader users
// can follow it. Other cards are plain articles. Links join the roving focus
// of the list around them (see roving-focus.ts).
export function Card({ card, gateway }: { card: MediaCard; gateway: SessionGateway }) {
  const href = cardRoute(card);
  const { image } = card;
  const src = image ? gateway.imageUrl(image.itemId, image.type, image.tag, CARD_IMAGE_WIDTH) : undefined;
  const parts = [card.title, card.subtitle];
  if (card.progress !== undefined) parts.push(`${Math.round(card.progress * 100)}% watched`);
  const label = parts.filter(Boolean).join(", ");

  const body = (
    <>
      <div className="card-art" style={{ aspectRatio: card.aspectRatio }}>
        <CardImage image={image} src={src} />
        {card.progress !== undefined ? (
          <div className="card-progress" aria-hidden="true">
            <div style={{ width: `${card.progress * 100}%` }} />
          </div>
        ) : null}
      </div>
      <span className="card-title" aria-hidden="true">{card.title}</span>
      {card.subtitle ? <span className="card-subtitle" aria-hidden="true">{card.subtitle}</span> : null}
    </>
  );

  if (href) {
    return <a className="media-card-button media-card-link" href={href} aria-label={label} data-roving-item="">{body}</a>;
  }
  return <article className="media-card-button" aria-label={label}>{body}</article>;
}
