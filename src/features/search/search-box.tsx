import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchHint } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { imageUrlFor } from "../card-view";
import { scopeFor } from "../query-scope";
import { moveToAdjacentRow } from "../roving-focus";
import { itemRoute, seriesRoute } from "../routes";
import { deferDefaultFocus } from "../shell/focus-return";
import { SearchField, SearchSuggestion } from "../shared/ui";
import { suggestionLabel, suggestionMeta } from "./search-hint-label";
import { searchResultsRoute } from "./search-route";

export const DEBOUNCE_MS = 250;
export const MIN_TERM_LENGTH = 2;
// Three times the desktop art width of 40 px.
export const SUGGESTION_IMAGE_WIDTH = 120;

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
  const inputRef = useRef<HTMLInputElement>(null);

  // The field takes focus when the page opens and when the route term changes from outside.
  useEffect(() => {
    const input = inputRef.current;
    if (input && !deferDefaultFocus(input)) input.focus();
  }, [initialTerm]);

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

  // A hint opens what it names; there is no intermediate search.
  function choose(hint: SearchHint) {
    setOpen(false);
    setActive(-1);
    switch (hint.kind) {
      case "Movie":
      case "Episode":
        goTo(itemRoute(hint.id));
        return;
      case "Series":
        goTo(seriesRoute(hint.id));
        return;
    }
  }

  function clear() {
    setText("");
    setEdited(true);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown": {
        if (hints.length === 0) {
          // No suggestion list: Down leaves the field for the first result row.
          const row = event.currentTarget.closest<HTMLElement>("[data-spatial-row]");
          if (row && moveToAdjacentRow(row, event.currentTarget, 1)) event.preventDefault();
          return;
        }
        event.preventDefault();
        setOpen(true);
        setActive((active + 1) % hints.length);
        return;
      }
      case "ArrowUp":
        if (!expanded) {
          // With the list closed, Up leaves the field for the row above, or the nav.
          const row = event.currentTarget.closest<HTMLElement>("[data-spatial-row]");
          if (row && moveToAdjacentRow(row, event.currentTarget, -1)) event.preventDefault();
          return;
        }
        event.preventDefault();
        setOpen(true);
        setActive(active <= 0 ? hints.length - 1 : active - 1);
        return;
      case "Escape":
        if (expanded) {
          setOpen(false);
          setActive(-1);
        } else if (text !== "") {
          // With the list closed, Escape clears the text (ARIA combobox pattern).
          event.preventDefault();
          clear();
        }
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

  const imageUrl = imageUrlFor(gateway);

  return (
    <form role="search" className="search-form" onSubmit={(event) => { event.preventDefault(); submit(text); }}>
      <SearchField
        id={`${listId}-input`}
        label="Search movies, series, and episodes"
        value={text}
        listId={listId}
        expanded={expanded}
        activeDescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        inputRef={inputRef}
        onChange={(value) => { setText(value); setEdited(true); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onClear={clear}
      />
      <ul id={listId} role="listbox" aria-label="Suggestions" className="ui-suggestions" hidden={!expanded}>
        {expanded ? hints.map((hint, index) => (
          <SearchSuggestion
            key={hint.id}
            id={`${listId}-${index}`}
            title={hint.name}
            meta={suggestionMeta(hint)}
            label={suggestionLabel(hint)}
            image={hint.image ? imageUrl(hint.image, SUGGESTION_IMAGE_WIDTH) : undefined}
            variant={hint.kind === "Episode" ? "still" : "poster"}
            selected={index === active}
            onChoose={() => choose(hint)}
          />
        )) : null}
      </ul>
      <p role="status" className="visually-hidden">
        {expanded ? `${hints.length} suggestions available` : ""}
      </p>
    </form>
  );
}
