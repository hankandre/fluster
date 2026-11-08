import { useQuery } from "@tanstack/react-query";
import type { SessionGateway } from "../../app/session";
import type { MediaSegment } from "../../domain/media-segments";
import type { PlaybackPlan } from "../../domain/playback";

const NO_SEGMENTS: MediaSegment[] = [];

// Intro and outro segments for the item being played. The request is made only
// when the negotiated version reports HasSegments, and a failed request just
// means no skip button.
export function useMediaSegments(
  gateway: SessionGateway,
  itemId: string,
  plan: PlaybackPlan | undefined,
): MediaSegment[] {
  const query = useQuery({
    queryKey: ["media-segments", itemId, plan?.mediaSourceId],
    queryFn: ({ signal }) => gateway.mediaSegments(itemId, signal),
    enabled: plan?.hasSegments === true,
    retry: false,
    gcTime: 0,
  });
  // A disabled query still returns cached data, so gate the result as well.
  if (plan?.hasSegments !== true) return NO_SEGMENTS;
  return query.data ?? NO_SEGMENTS;
}
