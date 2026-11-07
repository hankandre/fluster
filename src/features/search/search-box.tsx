import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchHint } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";
import { searchResultsRoute, seriesRoute } from "./search-route";

export const DEBOUNCE_MS = 250;
export const MIN_TERM_LENGTH = 2;

function hintLabel(hint: SearchHint): string {
  const detail = hint.kind === "Episode" ? hint.seriesName : hint.year?.toString();
  return detail ? `${hint.name} (${detail})` : hint.name;
}

function goTo(hash: string) {
  window.location.hash = hash;
}

// A search field with type-ahead hints, built as an ARIA combobox: focus stays
// in the input while arrow keys move the highlighted option.
export function SearchBox({ gateway, initialTerm }: { gateway: SessionGateway; initialTerm: string }) {
  const listId = useId();
  const [text, setText] = useState(initialTerm);
  const [debounced, setDebounced] = useState("");
  // The term from the URL already has results; hints start once the user edits.
  const [edited, setEdited] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    setText(initialTerm);
    setEdited(false);
  }, [initialTerm]);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const searchable = debounced.length >= MIN_TERM_LENGTH;
  // A new key cancels the previous request through the query's AbortSignal.
  const hintsQuery = useQuery({
    queryKey: ["search", scopeFor(gateway), "hints", debounced],
    queryFn: ({ signal }) => gateway.searchHints(debounced, signal),
    enabled: searchable && edited && debounced === text.trim(),
    gcTime: 0,
    retry: false,
  });

  const hints = searchable && edited && debounced === text.trim() ? hintsQuery.data ?? [] : [];
  const expanded = open && hints.length > 0;

  function submit(term: string) {
    const trimmed = term.trim();
    if (trimmed.length === 0) return;
    setOpen(false);
    setActive(-1);
    goTo(searchResultsRoute(trimmed));
  }

  // Series hints open the series; movies and episodes search for their name
  // until the detail view exists (P3-08).
  function choose(hint: SearchHint) {
    if (hint.kind === "Series") {
      setOpen(false);
      goTo(seriesRoute(hint.id));
      return;
    }
    setText(hint.name);
    submit(hint.name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (hints.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((active + 1) % hints.length);
        return;
      case "ArrowUp":
        if (hints.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(active <= 0 ? hints.length - 1 : active - 1);
        return;
      case "Escape":
        setOpen(false);
        setActive(-1);
        return;
      case "Enter": {
        event.preventDefault();
        const hint = expanded ? hints[active] : undefined;
        if (hint) choose(hint);
        else submit(text);
        return;
      }
    }
  }

  return (
    <form role="search" className="search-box" onSubmit={(event) => { event.preventDefault(); submit(text); }}>
      <label htmlFor={`${listId}-input`}>Search movies, series, and episodes</label>
      <input
        id={`${listId}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        value={text}
        onChange={(event) => { setText(event.target.value); setEdited(true); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <ul id={listId} role="listbox" aria-label="Suggestions" className="search-hints" hidden={!expanded}>
        {expanded ? hints.map((hint, index) => (
          <li
            key={hint.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Keep focus in the input so the click is not lost to a blur.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(hint)}
          >
            <span>{hintLabel(hint)}</span> <small>{hint.kind}</small>
          </li>
        )) : null}
      </ul>
      <p role="status" className="visually-hidden">
        {expanded ? `${hints.length} suggestions available` : ""}
      </p>
    </form>
  );
}
