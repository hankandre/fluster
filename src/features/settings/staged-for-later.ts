// Staged parts the player's Settings sheet leaves out. P3-33 brings the two streaming limit rows (Local network,
// Remote) and the Playback intro back; P3-34 removes "languages" from `sections`. Its own module so a section can
// read it without importing the section list (no import cycle).
export const STAGED_FOR_LATER = {
  sections: ["languages"],
  playbackLimitRows: true,
};
