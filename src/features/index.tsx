import { FEATURE_INDEX_LINKS } from "./routes";

export function FeatureIndex() {
  return (
    <main>
      <h1>Features</h1>
      <ul>
        {FEATURE_INDEX_LINKS.map(({ name, href }) => (
          <li key={name}>
            <a href={href}>{name}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
