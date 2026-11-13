import { useId, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { blurhashToDataUrl } from "../../home/blurhash";
import { useRovingFocus } from "../../roving-focus";
import { artTint } from "../art-tint";
import { useTvPrimaryRef } from "../use-tv-form";
import { LogoTitle } from "./logo-title";
import { ProgressRing } from "./progress-ring";
import { useNavOverHero } from "./app-shell";
import { ButtonLink } from "./button";
import { Skeleton } from "./skeleton";
import "./hero.css";

export interface HeroProps {
  title: string;
  // Already built by the gateway's imageUrl.
  logo?: { src: string };
  art?: { src: string; blurHash?: string };
  // One line, such as "S2 · E4 · 38 min left".
  facts?: string;
  overview?: string;
  // The facts and overview are still loading.
  detailPending?: boolean;
  primary?: { label: string; href: string; onActivate(event: MouseEvent<HTMLAnchorElement>): void; progress?: number };
  moreInfoHref?: string;
  // The primary action is still being found (a series' first episode).
  primaryPending?: boolean;
  // The whole hero is loading.
  pending?: boolean;
}

// The full-bleed header of a screen (DESIGN.md 7.3): art, a title, one facts line, an overview, and at most one
// primary action beside "More info". While mounted it asks the nav to be clear over it.
export function Hero(props: HeroProps) {
  useNavOverHero();
  const titleId = useId();
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const primaryRef = useTvPrimaryRef();

  if (props.pending) {
    return (
      <section className="hero" aria-busy="true" aria-label="Loading">
        <div className="hero-art" />
        <div className="hero-text">
          <Skeleton shape="block" width="min(360px, 100%)" height="var(--space-8)" />
          <Skeleton shape="line" width="min(240px, 100%)" />
          <div className="hero-actions">
            <Skeleton shape="block" width="160px" height="var(--control-h)" />
            <Skeleton shape="block" width="160px" height="var(--control-h)" />
          </div>
        </div>
      </section>
    );
  }

  const { title, logo, art, facts, overview, detailPending, primary, primaryPending, moreInfoHref } = props;
  const tint = artTint(art?.blurHash);
  const style = { "--art-accent": tint.accent, "--art-glow": tint.glow, "--art-shade": tint.shade } as CSSProperties;
  const placeholder = art?.blurHash ? blurhashToDataUrl(art.blurHash) : undefined;

  return (
    <section className="hero" aria-labelledby={titleId} style={style}>
      <div className="hero-art" style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}>
        {art ? <ArtImage key={art.src} src={art.src} /> : null}
      </div>
      <div className="hero-text">
        <h2 id={titleId} className="hero-title">
          <LogoTitle key={logo?.src ?? "text"} title={title} logo={logo} />
        </h2>
        {detailPending ? (
          <>
            <Skeleton shape="line" width="min(240px, 100%)" />
            <Skeleton shape="line" width="min(420px, 100%)" />
          </>
        ) : (
          <>
            {facts ? <p className="hero-facts">{facts}</p> : null}
            {overview ? <p className="hero-overview">{overview}</p> : null}
          </>
        )}
        <div className="hero-actions" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          {primaryPending ? <Skeleton shape="block" width="160px" height="var(--control-h)" /> : null}
          {primary ? (
            <ButtonLink
              variant="primary"
              href={primary.href}
              ref={primaryRef}
              onClick={primary.onActivate}
              data-roving-item=""
              aria-keyshortcuts={moreInfoHref ? "i" : undefined}
              onKeyDown={moreInfoHref ? (event) => openDetails(event, moreInfoHref) : undefined}
              icon={primary.progress !== undefined ? <ProgressRing value={primary.progress} /> : undefined}
            >
              {primary.label}
            </ButtonLink>
          ) : null}
          {moreInfoHref ? (
            <ButtonLink variant={primary || primaryPending ? "secondary" : "primary"} href={moreInfoHref} data-roving-item="">
              More info
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// Menu (ContextMenu) or `i` on the primary opens details where Enter plays (DESIGN.md 9).
function openDetails(event: KeyboardEvent<HTMLAnchorElement>, href: string) {
  const isInfo = event.key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (!isInfo && event.key !== "ContextMenu") return;
  event.preventDefault();
  window.location.hash = href;
}

function ArtImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt="" decoding="async" onError={() => setFailed(true)} />;
}
