import { useId, useState } from "react";
import type { SubtitleInfo } from "../../domain/catalog";
import type { LanguageCulture } from "../../domain/languages";
import { subtitleListView, type ListedSubtitle } from "../../domain/subtitle-list";
import { useRovingFocus } from "../roving-focus";
import { Button } from "../shared/ui";
import { showAllSubtitlesLabel, showFewerSubtitlesLabel, subtitleCountLine, subtitleLabel } from "./format";

function Tracks({ tracks }: { tracks: ListedSubtitle[] }) {
  return <>{tracks.map(({ index, subtitle }) => <li key={index}>{subtitleLabel(subtitle)}</li>)}</>;
}

// The Subtitles entry of File and streams (DESIGN.md 7.9): the viewer's language, or the default track and a
// count, then one button that lists every track in place and folds them away again. The button is its own spatial row.
export function SubtitleList({ subtitles, preference, cultures }: {
  subtitles: SubtitleInfo[];
  preference: string | undefined;
  cultures: LanguageCulture[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const view = subtitleListView(subtitles, preference, cultures);

  if (view.kind === "none") return <>None</>;
  if (view.kind === "all") return <ul><Tracks tracks={view.shown} /></ul>;

  const every: ListedSubtitle[] = subtitles.map((subtitle, index) => ({ index, subtitle }));
  const total = view.total;
  return (
    <>
      {expanded ? (
        <ul id={listId} aria-label={`All ${total} subtitles`}><Tracks tracks={every} /></ul>
      ) : (
        <div id={listId}>
          {view.shown.length > 0 ? <ul><Tracks tracks={view.shown} /></ul> : null}
          {view.kind === "summary" ? (
            <p className="subtitle-count">{subtitleCountLine(view.remaining, view.remainingLanguages, view.shown.length > 0)}</p>
          ) : null}
        </div>
      )}
      <div className="subtitle-list-row" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
        <Button variant="quiet" data-roving-item="" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
          {expanded ? showFewerSubtitlesLabel() : showAllSubtitlesLabel(total)}
        </Button>
      </div>
    </>
  );
}
