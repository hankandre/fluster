// Collapsed side rail (owner decision 2026-11-20): icons only, 88 px on the 1920 canvas; it
// expands to 300 px with labels while it holds focus, as an overlay, so the rows never reflow.
//
// Arm traps adds the focus work the stock rail lacks:
// - trapFocusLeft, Up and Down, so Left, Up or Down on the rail never escape into the
//   off-screen cards of a scrolled row, which sit under the rail;
// - a thin guide at the content's left edge (rendered by App) whose destination is the rail
//   item last used, so Left from any row's first card reaches the rail;
// - nextFocusRight on the rail items, set to the card the user left while the rail is open, so
//   Right goes back to it (only while that card's view still shows it). A return guide right
//   of the expanded rail was tried first: together with the edge guide it bounced focus
//   between the rail and the card on every Right (emulator, 2026-11-20).
import { createRef, useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, findNodeHandle, StyleSheet, Text, TVFocusGuideView, View } from "react-native";
import { trap } from "./arm";
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

type RailItemProps = { index: number; expanded: boolean; rightTo: number | undefined; onFocused: (v: ItemView) => void };

function RailItem({ index, expanded, rightTo, onFocused }: RailItemProps) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<ItemView>(null);
  const { label, glyph } = ITEMS[index];
  return (
    <Pressable
      ref={ref}
      // The old full-width rail took the first press by tree order; the overlay rail asks for it.
      hasTVPreferredFocus={index === 0}
      nextFocusRight={rightTo}
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
  const [rightTo, setRightTo] = useState<number | undefined>(undefined);
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
    if (!trap("return")) return;
    const card = returnTo();
    setRightTo(card ? (findNodeHandle(card as Parameters<typeof findNodeHandle>[0]) ?? undefined) : undefined);
  }, [returnTo]);
  const onLeave = useCallback(() => {
    setExpanded(false);
    setRightTo(undefined);
  }, []);
  return (
    <>
      <TVFocusGuideView
        autoFocus
        trapFocusLeft={trap("rail")}
        trapFocusUp={trap("rail")}
        trapFocusDown={trap("rail")}
        onFocusEnter={onEnter}
        onFocusLeave={onLeave}
        style={[styles.rail, expanded && styles.railExpanded]}
      >
        {ITEMS.map((it, i) => (
          <RailItem key={it.label} index={i} expanded={expanded} rightTo={rightTo} onFocused={onFocused} />
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
