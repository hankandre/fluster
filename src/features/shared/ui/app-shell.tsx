import { useRef, type MouseEvent, type ReactNode } from "react";
import "./shell.css";

// The signed-in frame: skip link, then the nav bar, then the page content.
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);

  // A plain "#content" href would replace the route hash, so focus the page's main landmark instead.
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const main = content.current?.querySelector<HTMLElement>("main");
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#content" onClick={skip}>Skip to content</a>
      <header className="app-nav">{nav}</header>
      <div className="app-content" ref={content}>{children}</div>
    </div>
  );
}
