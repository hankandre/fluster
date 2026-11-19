import { useId, useState } from "react";
import "./detail.css";

export interface Person {
  name: string;
  role?: string;
  imageSrc?: string;
}

// The width asked of the server for a person picture: twice the largest disc (176 px, TV).
export const PERSON_IMAGE_WIDTH = 360;

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

// The cast as picture cards with initials as the fallback; not interactive (Q8 A). So the grid wraps instead of scrolling.
export function PersonRow({ title = "Cast", people }: { title?: string; people: Person[] }) {
  const headingId = useId();
  if (people.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="ui-person-section">
      <h2 id={headingId} className="ui-section-title">{title}</h2>
      <ul className="ui-person-row">
        {people.map((person, index) => (
          <li key={index} className="ui-person">
            <PersonDisc key={person.imageSrc ?? ""} name={person.name} {...(person.imageSrc ? { imageSrc: person.imageSrc } : {})} />
            <span className="ui-person-name">{person.name}</span>
            {person.role ? <span className="ui-person-role">{person.role}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
