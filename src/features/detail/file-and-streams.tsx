import { useId } from "react";
import type { ItemVersion } from "../../domain/catalog";
import type { LanguageCulture } from "../../domain/languages";
import { audioLabel, sizeLabel, videoLabel } from "./format";
import { SubtitleList } from "./subtitle-list";

// The chosen version's file and streams (DESIGN.md 7.9). The version Picker lives in the action bar.
interface SubtitleLanguageProps {
  preference?: string | undefined;
  cultures?: LanguageCulture[] | undefined;
}

export function FileAndStreams({ versions, selected, preference, cultures }: { versions: ItemVersion[]; selected: ItemVersion | undefined } & SubtitleLanguageProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="file-and-streams">
      <h2 id={headingId} className="ui-section-title">File and streams</h2>
      {selected ? (
        <>
          {versions.length > 1 ? <p className="file-and-streams-version">Version: {selected.name}</p> : null}
          <MediaInfo version={selected} preference={preference} cultures={cultures} />
        </>
      ) : (
        <p>No media information for this item.</p>
      )}
    </section>
  );
}

export function MediaInfo({ version, preference, cultures }: { version: ItemVersion } & SubtitleLanguageProps) {
  const file = [version.container?.toUpperCase(), sizeLabel(version.sizeBytes)].filter(Boolean).join(" · ");
  return (
    <section className="media-info" aria-label={`Media info for ${version.name}`}>
      <dl>
        {file ? <><dt>File</dt><dd>{file}</dd></> : null}
        {version.video ? (
          <>
            <dt>Video</dt>
            <dd>{videoLabel(version.video)}</dd>
            <dt>Dynamic range</dt>
            <dd>{version.video.hdr}</dd>
          </>
        ) : null}
        <dt>Audio</dt>
        <dd>
          {version.audio.length === 0 ? "None" : (
            <ul>{version.audio.map((audio, index) => <li key={index}>{audioLabel(audio)}</li>)}</ul>
          )}
        </dd>
        <dt>Subtitles</dt>
        <dd>
          <SubtitleList key={version.id} subtitles={version.subtitles} preference={preference} cultures={cultures} />
        </dd>
      </dl>
    </section>
  );
}
