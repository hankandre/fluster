import type { ReactNode } from "react";
import { useRovingFocus } from "../../roving-focus";
import "./detail.css";

// The row of actions under a title (DESIGN.md 7.8). Left and Right move between the children that carry
// data-roving-item; Up and Down join the page's other spatial rows.
export function ActionBar({ children }: { children: ReactNode }) {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  return (
    <div className="ui-action-bar" role="group" aria-label="Actions" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
      {children}
    </div>
  );
}
