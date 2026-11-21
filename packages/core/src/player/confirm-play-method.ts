import type { ConversionReason, PlaybackPlan, ServerPlayMethod } from "../../domain/playback";

// The plan's DirectStream/Transcode label comes from the TranscodingUrl and is
// provisional (ARCHITECTURE.md §3 rule 5). Once the conversion runs, the
// server's session says what it really does: DirectStream exactly when it
// copies the video and, for a source with audio, the audio too; anything
// else is Transcode. Server reasons are added to the plan's. Returns
// undefined for a static plan, which never converts.
export function confirmedPlan(plan: PlaybackPlan, server: ServerPlayMethod): PlaybackPlan | undefined {
  if (plan.delivery !== "hls") return undefined;
  const hasAudio = plan.tracks.some((track) => track.type === "Audio");
  const copies = server.videoDirect && (!hasAudio || server.audioDirect);
  const reasons: ConversionReason[] = [...plan.conversionReasons];
  for (const reason of server.reasons) if (!reasons.includes(reason)) reasons.push(reason);
  return { ...plan, playMethod: copies ? "DirectStream" : "Transcode", conversionReasons: reasons };
}

// What every playstate report says about a converted session: Transcode, even
// when the server confirmed it only repackages. A DirectStream report makes
// Jellyfin clear the session's TranscodingInfo while ffmpeg still runs, so the
// server would lose track of the job. The UI keeps the confirmed label.
export function reportedPlan(plan: PlaybackPlan): PlaybackPlan {
  return plan.delivery === "hls" && plan.playMethod !== "Transcode" ? { ...plan, playMethod: "Transcode" } : plan;
}
