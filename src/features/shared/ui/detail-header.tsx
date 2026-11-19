import type { ReactNode, Ref } from "react";
import { useRovingFocus } from "../../roving-focus";
import { CardImage } from "./card-image";
import { LogoTitle } from "./logo-title";
import "./detail.css";

export interface DetailHeaderProps {
  title: string;
  // Already built by the gateway's imageUrl.
  logo?: { src: string };
  // The show an episode belongs to; a plain name when there is no link.
  seriesLink?: { name: string; href?: string };
  facts?: string;
  // Genres at the end of the facts line. With an href a genre is a link; without one it is plain text.
  genres?: { name: string; href?: string }[];
  badges?: ReactNode;
  actions: ReactNode;
  // Messages under the actions, such as "The player cannot start".
  notice?: ReactNode;
  overview?: ReactNode;
  // Art shown in the flow of the page on compact windows, or a poster beside the text when there is no backdrop.
  inlineArt?: { src: string; blurHash?: string; ratio: "16 / 9" | "2 / 3" };
  // The skeleton shows while the item loads.
  busy?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
}

// The header of the item detail page (DESIGN.md 7.7): the title or Logo is the page's h1, over the page's
// ambient art, in the left five columns. The art itself is the AmbientBackdrop behind the page.
export function DetailHeader({ title, logo, seriesLink, facts, genres, badges, actions, notice, overview, inlineArt, busy, headingRef }: DetailHeaderProps) {
  return (
    <header className="detail-header" aria-busy={busy || undefined}>
      {inlineArt ? (
        <div className="detail-inline-art" data-ratio={inlineArt.ratio === "2 / 3" ? "poster" : "wide"}>
          <CardImage image={inlineArt.blurHash ? { blurHash: inlineArt.blurHash } : undefined} src={inlineArt.src} />
        </div>
      ) : null}
      <div className="detail-text">
        {seriesLink ? <SeriesLink {...seriesLink} /> : null}
        <h1 ref={headingRef} tabIndex={-1} className="detail-title">
          <LogoTitle key={logo?.src ?? "text"} title={title} logo={logo} />
        </h1>
        <FactsLine facts={facts} genres={genres ?? []} />
        {badges}
        {actions}
        {notice}
        {overview}
      </div>
    </header>
  );
}

function SeriesLink({ name, href }: { name: string; href?: string }) {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  if (!href) return <p className="detail-series">{name}</p>;
  return (
    <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
      <a className="detail-series detail-series-link" href={href} data-roving-item="">{name}</a>
    </div>
  );
}

// The facts line (DESIGN.md 7.7). Genres without a link join the text; with links the line is one spatial row.
function FactsLine({ facts, genres }: { facts?: string; genres: { name: string; href?: string }[] }) {
  const roving = useRovingFocus<HTMLParagraphElement>("row", { spatial: true });
  if (!genres.some((genre) => genre.href)) {
    const line = [facts, ...genres.map((genre) => genre.name)].filter(Boolean).join(" · ");
    return line ? <p className="detail-facts">{line}</p> : null;
  }
  return (
    <p className="detail-facts" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
      {facts ? `${facts} · ` : null}
      {genres.map((genre, index) => (
        <span key={genre.name}>
          {index > 0 ? " · " : null}
          {genre.href
            ? <a className="detail-genre-link" href={genre.href} data-roving-item="">{genre.name}</a>
            : genre.name}
        </span>
      ))}
    </p>
  );
}
