import { useEffect, useRef, useState } from "react";
import type { SubtitleInfo } from "../../domain/catalog";
import type { LanguageCulture } from "../../domain/languages";
import { subtitleListView, type ListedSubtitle } from "../../domain/subtitle-list";
import { useRovingFocus } from "../roving-focus";
import { Button } from "../shared/ui";
import { showAllSubtitlesLabel, subtitleCountLine, subtitleLabel } from "./format";

function Tracks({ tracks }: { tracks: ListedSubtitle[] }) {
  return <>{tracks.map(({ index, subtitle }) => <li key={index}>{subtitleLabel(subtitle)}</li>)}</>;
}

// The Subtitles entry of File and streams (DESIGN.md 7.9): the viewer's language, or the default track and a
// count, then one button that lists every track in place. The button is its own spatial row.
export function SubtitleList({ subtitles, preference, cultures }: {
  subtitles: SubtitleInfo[];
  preference: string | undefined;
  cultures: LanguageCulture[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const view = subtitleListView(subtitles, preference, cultures);

  useEffect(() => {
    if (expanded) listRef.current?.focus();
  }, [expanded]);

  if (view.kind === "none") return <>None</>;
  if (view.kind === "all") return <ul><Tracks tracks={view.shown} /></ul>;

  const every: ListedSubtitle[] = subtitles.map((subtitle, index) => ({ index, subtitle }));
  const total = view.total;
  return (
    <>
      {expanded ? null : (
        <>
          {view.shown.length > 0 ? <ul><Tracks tracks={view.shown} /></ul> : null}
          {view.kind === "summary" ? (
            <p className="subtitle-count">{subtitleCountLine(view.remaining, view.remainingLanguages, view.shown.length > 0)}</p>
          ) : null}
        </>
      )}
      <div className="subtitle-list-row" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
        {expanded ? (
          <ul ref={listRef} data-roving-item="" aria-label={`All ${total} subtitles`}><Tracks tracks={every} /></ul>
        ) : (
          <Button variant="quiet" data-roving-item="" onClick={() => setExpanded(true)}>{showAllSubtitlesLabel(total)}</Button>
        )}
      </div>
    </>
  );
}
