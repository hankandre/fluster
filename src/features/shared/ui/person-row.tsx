import { useId } from "react";
import "./detail.css";

export interface Person {
  name: string;
  role?: string;
}

// The first letters of the first and last words, upper-cased: "Amy Adams" gives "AA", "Cher" gives "C".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

// The cast as initials cards (Q8 A). The cards are not interactive, so the grid wraps instead of scrolling.
export function PersonRow({ title = "Cast", people }: { title?: string; people: Person[] }) {
  const headingId = useId();
  if (people.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="ui-person-section">
      <h2 id={headingId} className="ui-section-title">{title}</h2>
      <ul className="ui-person-row">
        {people.map((person, index) => (
          <li key={index} className="ui-person">
            <span className="ui-person-disc" aria-hidden="true">{initials(person.name)}</span>
            <span className="ui-person-name">{person.name}</span>
            {person.role ? <span className="ui-person-role">{person.role}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
