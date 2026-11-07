import type { ItemVersion } from "../../domain/catalog";
import { audioLabel, sizeLabel, subtitleLabel, videoLabel } from "./format";

// Version names are the server's, such as "1080p" or "4K HDR". One radio group
// keeps arrow-key selection native.
export function VersionPicker({ versions, selectedId, onSelect }: { versions: ItemVersion[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <fieldset className="version-picker">
      <legend>Version</legend>
      {versions.map((version) => (
        <label key={version.id}>
          <input
            type="radio"
            name="version"
            value={version.id}
            checked={version.id === selectedId}
            onChange={() => onSelect(version.id)}
          />
          {version.name}
        </label>
      ))}
    </fieldset>
  );
}

export function MediaInfo({ version }: { version: ItemVersion }) {
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
          {version.subtitles.length === 0 ? "None" : (
            <ul>{version.subtitles.map((subtitle, index) => <li key={index}>{subtitleLabel(subtitle)}</li>)}</ul>
          )}
        </dd>
      </dl>
    </section>
  );
}
