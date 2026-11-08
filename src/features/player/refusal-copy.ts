import type { RefusalReason } from "../../domain/playback";

export interface RefusalCopy {
  title: string;
  explanation: string;
  whatYouCanDo: string;
}

// Plain-language copy for every reason Fluster still refuses to start playback
// (decision 0002). Conversion on the server is the normal fallback, so no copy
// here promises or refuses it on Fluster's behalf; conversion-not-allowed names
// the Jellyfin user settings that allow it. Record<RefusalReason, …> makes a
// new reason fail compilation until it has copy.
//
// Dashboard labels are jellyfin-web's own strings (src/strings/en-us.json
// OptionAllow*, shown under "Media playback" on Dashboard > Users > the user >
// Profile; Profile.tsx maps them to EnableVideoPlaybackTranscoding,
// EnableAudioPlaybackTranscoding, and EnablePlaybackRemuxing).
export const REFUSAL_COPY: Record<RefusalReason, RefusalCopy> = {
  "no-sources": {
    title: "No file to play",
    explanation: "Jellyfin did not offer a file for this item, or not the version you chose.",
    whatYouCanDo: "Go back and pick another version, or ask the server admin to check that the file is still in the library. Retry asks the server again.",
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
  "disc-source": {
    title: "This is a disc folder",
    explanation: "This is a Blu-ray or DVD folder, not a single video file. Jellyfin keeps offering it as it is stored, and Fluster can’t play a disc folder that way.",
    whatYouCanDo: "Rip the disc to an MKV file and add that to your library to play it here.",
  },
  "iso-source": {
    title: "Disc images aren’t supported yet",
    explanation: "This is a disc image (ISO). Jellyfin keeps offering it as it is stored, and Fluster can’t play those that way yet.",
    whatYouCanDo: "Rip or extract the disc to an MKV file and add that to your library to play it here.",
  },
  "missing-source-data": {
    title: "Jellyfin gave incomplete details",
    explanation: "The server’s answer for this file was missing information Fluster needs to play it safely.",
    whatYouCanDo: "Choose Retry. If it keeps happening, ask the server admin to rescan this item in the library.",
  },
  "conversion-not-allowed": {
    title: "This file needs converting, and the server doesn’t allow that for your account",
    explanation: "Jellyfin can’t send this file as it is stored, for example because of its format or a limit on your account, and your account isn’t allowed to have it converted.",
    whatYouCanDo: "Ask the server admin to turn on “Allow video playback that requires transcoding”, “Allow audio playback that requires transcoding”, and “Allow video playback that requires conversion without re-encoding” for your user (Dashboard, Users, your user, Profile, Media playback). Then choose Retry.",
  },
  "unsafe-transcoding-url": {
    title: "Jellyfin offered a stream address Fluster won’t use",
    explanation: "The server offered a converted stream for this file, but the address it gave points somewhere Fluster doesn’t trust or asks for something Fluster never allows.",
    whatYouCanDo: "Choose Retry. If it keeps happening, check that the server address is correct and that no proxy rewrites Jellyfin’s answers.",
  },
};

// The browser development engine cannot send the Authorization header a
// converted (HLS) stream needs, so it refuses those plans. This is the desktop
// app's job, not a substitute for it (decision 0002).
export const DESKTOP_ONLY_COPY: RefusalCopy = {
  title: "This stream needs the desktop player",
  explanation: "Jellyfin is converting this file for playback. The browser version of Fluster can only play files exactly as stored.",
  whatYouCanDo: "Open this item in the Fluster desktop app.",
};
