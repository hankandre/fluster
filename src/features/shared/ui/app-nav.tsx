import type { FocusEvent } from "react";
import { Search, Settings } from "lucide-react";
import { useRovingFocus } from "../../roving-focus";
import "./shell.css";

export interface NavLibrary {
  id: string;
  name: string;
}

const HOME_HASH = "#/next/home";
const SEARCH_HASH = "#/next/search";
const SETTINGS_HASH = "#/next/settings";

function libraryHash(id: string): string {
  return `#/next/browse/${encodeURIComponent(id)}`;
}

// Which entry the hash marks as current: "home", "search", "settings", "library:<id>", or undefined.
export function currentNavEntry(hash: string): string | undefined {
  if (hash === HOME_HASH) return "home";
  if (hash === SEARCH_HASH || hash.startsWith(`${SEARCH_HASH}/`)) return "search";
  if (hash === SETTINGS_HASH) return "settings";
  const prefix = "#/next/browse/";
  if (hash.startsWith(prefix)) {
    const rest = hash.slice(prefix.length);
    if (rest === "" || rest.includes("/")) return undefined;
    try {
      return `library:${decodeURIComponent(rest)}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// The main navigation bar (DESIGN.md 7.1). Presentational: the caller supplies the libraries.
// `undefined` libraries (pending or failed) leaves only the fixed entries.
export function AppNav({ libraries, hash }: { libraries: NavLibrary[] | undefined; hash: string }) {
  const current = currentNavEntry(hash);
  const entries = [
    { key: "home", href: HOME_HASH },
    ...(libraries ?? []).map((library) => ({ key: `library:${library.id}`, href: libraryHash(library.id) })),
    { key: "search", href: SEARCH_HASH },
    { key: "settings", href: SETTINGS_HASH },
  ];
  const currentIndex = entries.findIndex((entry) => entry.key === current);
  // Item 0 is the wordmark, so entry indexes shift by one. With no current entry the Tab stop is Home.
  const preferredIndex = (currentIndex < 0 ? 0 : currentIndex) + 1;
  const roving = useRovingFocus<HTMLElement>("row", { preferredIndex });

  function onFocus(event: FocusEvent<HTMLElement>) {
    roving.onFocus(event);
    const target = event.target as HTMLElement;
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const aria = (key: string) => (current === key ? ({ "aria-current": "page" } as const) : {});

  return (
    <nav className="app-nav-bar" aria-label="Main" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={onFocus}>
      <div className="app-nav-list">
        <a className="app-nav-entry app-nav-wordmark" href={HOME_HASH} data-roving-item="">Fluster</a>
        <a className="app-nav-entry" href={HOME_HASH} data-roving-item="" {...aria("home")}>Home</a>
        {(libraries ?? []).map((library) => (
          <a
            key={library.id}
            className="app-nav-entry"
            href={libraryHash(library.id)}
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
      </a>
    </nav>
  );
}
