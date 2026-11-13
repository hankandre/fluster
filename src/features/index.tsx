const features = ["sign-in", "home", "search", "detail", "player", "settings"];

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
    </main>
  );
}
