import { useState } from "react";
import "./detail.css";

export interface Person {
  name: string;
  role?: string;
  imageSrc?: string;
}

// The width asked of the server for a person picture: twice the largest disc (200 px, 1920 and TV).
export const PERSON_IMAGE_WIDTH = 400;

// The first letters of the first and last words, upper-cased: "Amy Adams" gives "AA", "Cher" gives "C".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

// The initials show while there is no picture, while it loads, and after it fails. Once it has loaded they leave
// the DOM, so nothing shows through a transparent picture.
function PersonDisc({ name, imageSrc }: { name: string; imageSrc?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const showImage = imageSrc !== undefined && state !== "failed";
  return (
    <span className="ui-person-disc" aria-hidden="true">
      {showImage && state === "loaded" ? null : initials(name)}
      {showImage ? (
        <img
          className="ui-person-image"
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      ) : null}
    </span>
  );
}

// One cast member in the cast row. It takes focus like a media card (the row's roving stop) but has no action:
// Enter does nothing. The accessible name carries the name and the role.
export function PersonCard({ person }: { person: Person }) {
  const name = person.role ? `${person.name}, ${person.role}` : person.name;
  return (
    <div className="ui-person" data-person-card="" data-roving-item="" role="group" aria-label={name}>
      <PersonDisc key={person.imageSrc ?? ""} name={person.name} {...(person.imageSrc ? { imageSrc: person.imageSrc } : {})} />
      <span className="ui-person-name" aria-hidden="true">{person.name}</span>
      {person.role ? <span className="ui-person-role" aria-hidden="true">{person.role}</span> : null}
    </div>
  );
}
