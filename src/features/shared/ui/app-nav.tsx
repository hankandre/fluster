import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { Search, Settings } from "lucide-react";
import { useRovingFocus } from "../../roving-focus";
import { libraryRoute, parseLibraryRoute } from "../../routes";
import "./shell.css";

export interface NavLibrary {
  id: string;
  name: string;
}

const HOME_HASH = "#/next/home";
const SEARCH_HASH = "#/next/search";
const SETTINGS_HASH = "#/next/settings";


// Which entry the hash marks as current: "home", "search", "settings", "library:<id>", or undefined.
export function currentNavEntry(hash: string): string | undefined {
  if (hash === HOME_HASH) return "home";
  if (hash === SEARCH_HASH || hash.startsWith(`${SEARCH_HASH}/`)) return "search";
  if (hash === SETTINGS_HASH) return "settings";
  const library = parseLibraryRoute(hash);
  return library ? `library:${library.libraryId}` : undefined;
}

type Overflow = "none" | "start" | "end" | "both";

// Which edges of the scrolling list hide entries (1 px tolerance, as MediaRow).
function overflowOf(list: HTMLElement): Overflow {
  const start = list.scrollLeft > 1;
  const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
  if (start && end) return "both";
  return start ? "start" : end ? "end" : "none";
}

// The main navigation bar (DESIGN.md 7.1). Presentational: the caller supplies the libraries.
// `undefined` libraries (pending or failed) leaves only the fixed entries. `userInitial` is a label only, drawn
// inside the Settings link until the account menu (P13-21) gives it a control of its own.
export function AppNav({ libraries, hash, userInitial }: { libraries: NavLibrary[] | undefined; hash: string; userInitial?: string }) {
  const current = currentNavEntry(hash);
  const entries = [
    { key: "home", href: HOME_HASH },
    ...(libraries ?? []).map((library) => ({ key: `library:${library.id}`, href: libraryRoute(library.id) })),
    { key: "search", href: SEARCH_HASH },
    { key: "settings", href: SETTINGS_HASH },
  ];
  const currentIndex = entries.findIndex((entry) => entry.key === current);
  // Item 0 is the wordmark, so entry indexes shift by one. With no current entry the Tab stop is Home.
  const preferredIndex = (currentIndex < 0 ? 0 : currentIndex) + 1;
  const roving = useRovingFocus<HTMLElement>("row", { preferredIndex });
  const list = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<Overflow>("none");

  // The list fades the edge that hides entries (DESIGN.md 7.1).
  const measure = useCallback(() => {
    if (list.current) setOverflow(overflowOf(list.current));
  }, []);
  useLayoutEffect(measure, [measure, libraries]);
  useEffect(() => {
    const element = list.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  // Keep the current entry visible on narrow widths, on mount and when the page changes. Scroll the
  // list itself: scrollIntoView would move the document's sequential focus starting point.
  useEffect(() => {
    const entry = roving.ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const list = entry?.parentElement;
    if (!entry || !list || list.className !== "app-nav-list" || typeof list.scrollTo !== "function") return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pad = parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0;
    const behavior = reduced ? "auto" : "smooth";
    if (entry.offsetLeft - pad < list.scrollLeft) list.scrollTo({ left: entry.offsetLeft - pad, behavior });
    else if (entry.offsetLeft + entry.offsetWidth + pad > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: entry.offsetLeft + entry.offsetWidth + pad - list.clientWidth, behavior });
    }
  }, [current, roving.ref]);

  function onFocus(event: FocusEvent<HTMLElement>) {
    roving.onFocus(event);
    const target = event.target as HTMLElement;
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const aria = (key: string) => (current === key ? ({ "aria-current": "page" } as const) : {});

  return (
    <nav className="app-nav-bar" aria-label="Main" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={onFocus}>
      <div className="app-nav-list" ref={list} data-overflow={overflow} onScroll={measure}>
        <a className="app-nav-entry app-nav-wordmark" href={HOME_HASH} data-roving-item="">Fluster</a>
        <a className="app-nav-entry" href={HOME_HASH} data-roving-item="" {...aria("home")}>Home</a>
        {(libraries ?? []).map((library) => (
          <a
            key={library.id}
            className="app-nav-entry"
            href={libraryRoute(library.id)}
            data-roving-item=""
            {...aria(`library:${library.id}`)}
          >
            {library.name}
          </a>
        ))}
        <a className="app-nav-entry" href={SEARCH_HASH} data-roving-item="" {...aria("search")}>
          <Search aria-hidden="true" size={18} />
          Search
        </a>
      </div>
      <a className="app-nav-entry app-nav-settings" href={SETTINGS_HASH} aria-label="Settings" data-roving-item="" {...aria("settings")}>
        <Settings aria-hidden="true" size={20} />
        {userInitial ? <span className="app-nav-initial" aria-hidden="true">{userInitial}</span> : null}
      </a>
    </nav>
  );
}
