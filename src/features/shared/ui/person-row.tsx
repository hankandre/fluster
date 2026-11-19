import { MediaRow } from "./media-row";
import type { Person } from "./person-card";

export { initials, PERSON_IMAGE_WIDTH, type Person } from "./person-card";

// The cast as one scrolling row of round pictures (DESIGN.md 7.7), built on MediaRow so it pages, fades, and
// takes arrow keys like the other rows. Initials stand in when a person has no picture.
export function PersonRow({ title = "Cast", people }: { title?: string; people: Person[] }) {
  return <MediaRow title={title} variant="person" status="ready" people={people} />;
}
