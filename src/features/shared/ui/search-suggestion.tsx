import { CardImage } from "./card-image";
import "./search.css";

export interface SearchSuggestionProps {
  id: string;
  title: string;
  meta: string;
  // The option's accessible name, such as "Arrival, 2016, Movie".
  label: string;
  image?: string;
  // Posters are 2:3; episode stills are 16:9. Both sit in the same art column.
  variant: "poster" | "still";
  selected: boolean;
  onChoose(): void;
}

// One option of the search suggestion list (DESIGN.md 7.13).
export function SearchSuggestion({ id, title, meta, label, image, variant, selected, onChoose }: SearchSuggestionProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-label={label}
      className="ui-suggestion"
      // Keep focus in the input so the click is not lost to a blur.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
    >
      <span className="ui-suggestion-art" data-variant={variant} aria-hidden="true">
        <CardImage image={undefined} src={image} />
      </span>
      <span className="ui-suggestion-text" aria-hidden="true">
        <span className="ui-suggestion-title">{title}</span>
        <span className="ui-suggestion-meta">{meta}</span>
      </span>
    </li>
  );
}
