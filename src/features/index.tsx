import { SignOutButton } from "./sign-out-button";

const features = ["sign-in", "home", "browse", "search", "detail", "player", "settings"];

export function FeatureIndex() {
  return (
    <main>
      <h1>Features</h1>
      <ul>
        {features.map((name) => (
          <li key={name}>
            <a href={`#/next/${name}`}>{name}</a>
          </li>
        ))}
      </ul>
      <SignOutButton />
    </main>
  );
}
