import type { RefusalReason } from "../../domain/playback";

export interface RefusalCopy {
  title: string;
  explanation: string;
  whatYouCanDo: string;
}

// Plain-language copy for every reason Fluster refuses to start playback.
// Record<RefusalReason, …> makes a new reason fail compilation until it has
// copy. None of it offers conversion: Fluster plays files exactly as stored.
//
// Remote bitrate limits and forced remote transcoding need no reason of their
// own: the server folds them into SupportsDirectPlay=false (MediaInfoHelper.cs
// v12.4 lines 259, 277, 307-309), so they surface as "no-direct-play".
export const REFUSAL_COPY: Record<RefusalReason, RefusalCopy> = {
  "no-sources": {
    title: "No file to play",
    explanation: "Jellyfin did not offer a file for this item, or not the version you chose.",
    whatYouCanDo: "Go back and pick another version, or ask the server admin to check that the file is still in the library. Retry asks the server again.",
  },
  "no-direct-play": {
    title: "The server won’t let Fluster play this file as it is",
    explanation: "Fluster plays files exactly as they are stored. Jellyfin said this file can’t be sent that way. This usually means your account or this connection is limited, for example by a remote bitrate limit or a setting that forces conversion for remote users.",
    whatYouCanDo: "Ask the server admin to lift that limit or setting for your user, then choose Retry. Fluster won’t ask the server to convert the file.",
  },
  "not-a-file": {
    title: "This isn’t a file Fluster can stream",
    explanation: "Jellyfin describes this item as something other than a file on the server, such as a remote or network stream. Fluster only plays files it can fetch as stored.",
    whatYouCanDo: "Play it with another app, or add it to the library as a regular file.",
  },
  "live-source": {
    title: "Live streams aren’t supported",
    explanation: "This item is a live stream, not a stored file. Fluster plays recorded files only.",
    whatYouCanDo: "Play it with another app, or play a recording of it once one exists.",
  },
  "server-requires-transcoding": {
    title: "This file would have to be converted",
    explanation: "Jellyfin can only deliver this file by converting it first. Fluster plays files exactly as stored and won’t ask the server to convert them.",
    whatYouCanDo: "Ask the server admin whether a setting or limit on your user is forcing conversion. If it is changed, choose Retry.",
  },
  "disc-source": {
    title: "This is a disc folder",
    explanation: "This is a Blu-ray or DVD folder, not a single video file. Fluster plays files exactly as stored and won’t ask the server to convert discs.",
    whatYouCanDo: "Rip the disc to an MKV file and add that to your library to play it here.",
  },
  "iso-source": {
    title: "Disc images aren’t supported yet",
    explanation: "This is a disc image (ISO). Fluster can’t play those directly yet, and it won’t ask the server to convert them.",
    whatYouCanDo: "Rip or extract the disc to an MKV file and add that to your library to play it here.",
  },
  "missing-source-data": {
    title: "Jellyfin gave incomplete details",
    explanation: "The server’s answer for this file was missing information Fluster needs to play it safely.",
    whatYouCanDo: "Choose Retry. If it keeps happening, ask the server admin to rescan this item in the library.",
  },
};
