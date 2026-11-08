import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { blurhashToDataUrl } from "../home/blurhash";
import { artTint } from "./art-tint";

const FALLBACK_FADE_MS = 480;

// Reads --dur-slow from the document so the timer matches the CSS crossfade.
export function ambientFadeMs(): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur-slow").trim();
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return FALLBACK_FADE_MS;
    return raw.endsWith("ms") ? value : raw.endsWith("s") ? value * 1000 : FALLBACK_FADE_MS;
  } catch {
    return FALLBACK_FADE_MS;
  }
}

interface Layer {
  key: string;
  src: string | undefined;
  blurHash: string | undefined;
}

export interface AmbientBackdropProps {
  // Identifies the current image; a new key starts a crossfade.
  imageKey: string;
  // Already built by the gateway's imageUrl; this component never builds URLs.
  src?: string;
  blurHash?: string;
  // 1 for Detail, 0.35 for Home.
  strength?: number;
  children?: ReactNode;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A fixed art layer behind its children (DESIGN.md §7.2). It also sets
// --art-accent, --art-glow, and --art-shade for everything inside it.
export function AmbientBackdrop({ imageKey, src, blurHash, strength = 1, children }: AmbientBackdropProps) {
  const current: Layer = { key: imageKey, src, blurHash };
  const [layers, setLayers] = useState<Layer[]>([current]);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const next: Layer = { key: imageKey, src, blurHash };
    if (prefersReducedMotion()) {
      setLayers([next]);
      return;
    }
    // A blank previous layer has nothing to fade from.
    setLayers((previous) => [...previous.slice(-1).filter((layer) => layer.key !== imageKey && (layer.src || layer.blurHash)), next]);
    const timer = window.setTimeout(() => setLayers([next]), ambientFadeMs());
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey, src, blurHash]);

  const tint = artTint(blurHash);
  const style = {
    "--art-accent": tint.accent,
    "--art-glow": tint.glow,
    "--art-shade": tint.shade,
    "--ambient-strength": strength,
  } as CSSProperties;

  return (
    <div className="ambient" data-testid="ambient-backdrop" style={style}>
      <div className="ambient-layers" aria-hidden="true">
        {layers.map((layer, index) => (
          <AmbientLayer key={layer.key} layer={layer} entering={index > 0} />
        ))}
      </div>
      <div className="ambient-content">{children}</div>
    </div>
  );
}

function AmbientLayer({ layer, entering }: { layer: Layer; entering: boolean }) {
  const [failed, setFailed] = useState(false);
  const placeholder = layer.blurHash ? blurhashToDataUrl(layer.blurHash) : undefined;
  return (
    <div
      className="ambient-layer"
      data-testid="ambient-layer"
      data-key={layer.key}
      data-entering={entering ? "true" : undefined}
      style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
    >
      {layer.src && !failed ? <img src={layer.src} alt="" decoding="async" onError={() => setFailed(true)} /> : null}
    </div>
  );
}
