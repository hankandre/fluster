import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { isTvForm } from "../tv-form";
import "./shell.css";

// A screen with a hero calls this while mounted, so the nav is clear over the hero (DESIGN.md 7.1).
const NavOverHeroContext = createContext<{ enter(): void; leave(): void } | undefined>(undefined);

export function useNavOverHero(): void {
  const context = useContext(NavOverHeroContext);
  useEffect(() => {
    if (!context) return undefined;
    context.enter();
    return () => context.leave();
  }, [context]);
}

const SCROLL_STEP = 8;
const FALLBACK_NAV_HEIGHT = 64;

// The signed-in frame: skip link, then the nav bar, then the page content. The nav is clear over a hero at
// the top of the page, turns to glass once content scrolls under it, hides on scroll down, and returns on scroll up.
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const [overHero, setOverHero] = useState(0);
  const [atTop, setAtTop] = useState(true);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  const heroes = useRef({
    enter: () => setOverHero((count) => count + 1),
    leave: () => setOverHero((count) => Math.max(0, count - 1)),
  });

  const onScroll = useCallback(() => {
    const y = window.scrollY;
    setAtTop(y <= 0);
    const navHeight = header.current?.offsetHeight || FALLBACK_NAV_HEIGHT;
    const delta = y - lastY.current;
    // In the TV form focus drives the tab row (see onContentFocus), not scroll.
    if (document.documentElement.dataset.form === "tv") return;
    if (y <= navHeight) {
      lastY.current = y;
      setHidden(false);
    } else if (delta >= SCROLL_STEP) {
      lastY.current = y;
      const focusInHeader = header.current?.contains(document.activeElement) === true;
      if (y > 2 * navHeight && !focusInHeader) setHidden(true);
    } else if (delta <= -SCROLL_STEP) {
      lastY.current = y;
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    setAtTop(window.scrollY <= 0);
    let frame = 0;
    const listener = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        onScroll();
      });
    };
    window.addEventListener("scroll", listener, { passive: true });
    return () => {
      window.removeEventListener("scroll", listener);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [onScroll]);

  // A plain "#content" href would replace the route hash, so focus the page's main landmark instead.
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const main = content.current?.querySelector<HTMLElement>("main");
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
  }

  // TV form: the tab row hides while focus is in the content and shows when focus enters it (DESIGN.md §6).
  function onContentFocus() {
    if (isTvForm()) setHidden(true);
  }

  const surface = overHero > 0 && atTop ? "clear" : "glass";

  return (
    <NavOverHeroContext.Provider value={heroes.current}>
      <div className="app-frame">
        <a className="skip-link" href="#content" onClick={skip}>Skip to content</a>
        <header
          className="app-nav"
          ref={header}
          data-surface={surface}
          data-hidden={hidden ? "true" : "false"}
          onFocus={() => setHidden(false)}
        >
          {nav}
        </header>
        <div className="app-content" ref={content} onFocus={onContentFocus}>{children}</div>
      </div>
    </NavOverHeroContext.Provider>
  );
}
