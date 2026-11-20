// Values copied from src/styles/tokens.css and DESIGN.md §6 (TV form) for the spike only.
export const color = {
  surface0: "#0b0c0e",
  surface2: "#1b1c20",
  text1: "#f2efe9",
  text2: "#a9a59d",
  onLight: "#0b0c0e",
  focus: "#fff4dc",
  railScrim: "rgba(11,12,14,0.72)",
};

export const design = {
  posterW: 248, // DESIGN.md §6: posters 248 px on the 1920 canvas
  cardGap: 24,
  rowGap: 48,
  railW: 300,
  typeDisplay: 64,
  typeHeading: 33,
  typeBody: 28,
  typeLabel: 24,
  radiusArt: 6,
  radiusControl: 10,
  lift: 1.08, // --lift on TV
  liftMs: 160, // --dur-quick
  dwellMs: 300, // DESIGN.md §7.2 dwell
  crossfadeMs: 300, // task brief: about 300 ms
};
