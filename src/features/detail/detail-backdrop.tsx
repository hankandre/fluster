import { useState, type ReactNode } from "react";
import type { SessionGateway } from "../../app/session";
import { backdropWidth } from "../card-view";
import { AmbientBackdrop } from "../shared/ambient-backdrop";
import type { ArtSource } from "./art-source";

// The ambient backdrop of a detail-style page. It stays mounted across item changes so the art can crossfade.
// `children` receives the setter its content calls with the item's art.
export function DetailBackdrop({ gateway, children }: { gateway: SessionGateway; children(onArt: (art: ArtSource | undefined) => void): ReactNode }) {
  const [art, setArt] = useState<ArtSource | undefined>();
  return (
    <AmbientBackdrop
      imageKey={art?.key ?? "none"}
      src={art?.image ? gateway.imageUrl(art.image.itemId, art.image.type, art.image.tag, backdropWidth()) : undefined}
      blurHash={art?.blurHash}
    >
      {children(setArt)}
    </AmbientBackdrop>
  );
}
