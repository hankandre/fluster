// Collapsed side rail (owner decision 2026-11-20): icons only, 88 px on the 1920 canvas; it
// expands to 300 px with labels while it holds focus, as an overlay, so the rows never reflow.
//
// Arm traps adds the focus work the stock rail lacks:
// - trapFocusLeft, so Left on the rail never escapes into off-screen cards under it;
// - a thin guide at the content's left edge (rendered by App) whose destination is the rail
//   item last used, so Left from any row's first card reaches the rail;
// - a return guide just right of the expanded rail whose destination is the card the user
//   left, so Right goes back to it (only while that card's view still shows it).
import { createRef, useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, TVFocusGuideView, View } from "react-native";
import { ARM } from "./arm";
import { color, design } from "./tokens";

const { width: W } = Dimensions.get("window");
const u = (px: number) => (px * W) / 1920;

export const RAIL_COLLAPSED_W = u(design.railCollapsedW);
const RAIL_EXPANDED_W = u(design.railW);
const ICON = u(56);

// TVFocusGuideView takes a ref at runtime (React 19 ref-as-prop) and puts setDestinations on
// it, but its generated types omit both.
export type Guide = { setDestinations: (d: unknown[]) => void };
export const GuideView = TVFocusGuideView as unknown as React.ComponentType<
  React.ComponentProps<typeof TVFocusGuideView> & { ref?: React.Ref<Guide> }
>;
export const edgeGuideRef = createRef<Guide>();

const ITEMS = [
  { label: "Home", glyph: "⌂" },
  { label: "Search", glyph: "⌕" },
  { label: "Movies", glyph: "▣" },
  { label: "Shows", glyph: "▤" },
  { label: "Settings", glyph: "⚙" },
];

type ItemView = React.ComponentRef<typeof Pressable>;

function RailItem({ index, expanded, onFocused }: { index: number; expanded: boolean; onFocused: (v: ItemView) => void }) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<ItemView>(null);
  const { label, glyph } = ITEMS[index];
  return (
    <Pressable
      ref={ref}
      // The old full-width rail took the first press by tree order; the overlay rail asks for it.
      hasTVPreferredFocus={index === 0}
      onFocus={() => {
        setFocused(true);
        if (ref.current) onFocused(ref.current);
        console.log(`FOCUS rail,${index}`);
      }}
      onBlur={() => {
        setFocused(false);
        console.log(`BLUR rail,${index}`);
      }}
      style={[styles.item, focused && styles.itemFocused]}
    >
      <Text style={[styles.glyph, focused && styles.textFocused]}>{glyph}</Text>
      {expanded ? <Text style={[styles.label, focused && styles.textFocused]}>{label}</Text> : null}
    </Pressable>
  );
}

export function Rail({ returnTo }: { returnTo: () => unknown }) {
  const [expanded, setExpanded] = useState(false);
  const [canReturn, setCanReturn] = useState(false);
  const returnGuide = useRef<Guide>(null);
  const first = useRef<ItemView | null>(null);
  const onFocused = useCallback((v: ItemView) => {
    if (!first.current) first.current = v;
    edgeGuideRef.current?.setDestinations([v]);
  }, []);
  useEffect(() => {
    if (first.current) edgeGuideRef.current?.setDestinations([first.current]);
  }, []);
  const onEnter = useCallback(() => {
    setExpanded(true);
    if (!ARM.traps) return;
    const card = returnTo();
    if (card) returnGuide.current?.setDestinations([card]);
    setCanReturn(Boolean(card));
  }, [returnTo]);
  const onLeave = useCallback(() => {
    setExpanded(false);
    setCanReturn(false);
  }, []);
  return (
    <>
      {ARM.traps ? (
        <GuideView ref={returnGuide} enabled={expanded && canReturn} style={styles.returnGuide} />
      ) : null}
      <TVFocusGuideView
        autoFocus
        trapFocusLeft={ARM.traps}
        onFocusEnter={onEnter}
        onFocusLeave={onLeave}
        style={[styles.rail, expanded && styles.railExpanded]}
      >
        {ITEMS.map((it, i) => (
          <RailItem key={it.label} index={i} expanded={expanded} onFocused={onFocused} />
        ))}
      </TVFocusGuideView>
    </>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: RAIL_COLLAPSED_W,
    paddingTop: u(54 + 40),
    paddingHorizontal: (RAIL_COLLAPSED_W - ICON) / 2,
    backgroundColor: color.railScrim,
    zIndex: 2,
  },
  railExpanded: { width: RAIL_EXPANDED_W, backgroundColor: color.railScrimOpen },
  returnGuide: { zIndex: 2, position: "absolute", left: RAIL_EXPANDED_W, top: 0, bottom: 0, width: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    height: ICON,
    minWidth: ICON,
    borderRadius: u(design.radiusControl),
    marginBottom: u(12),
  },
  itemFocused: { backgroundColor: color.text1 },
  glyph: { width: ICON, textAlign: "center", color: color.text2, fontSize: u(30) },
  label: { color: color.text2, fontSize: u(design.typeLabel), fontWeight: "600", marginLeft: u(4), paddingRight: u(20) },
  textFocused: { color: color.onLight },
});
