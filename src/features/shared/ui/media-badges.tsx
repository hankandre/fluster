import "./detail.css";

// Text badges for the chosen version (DESIGN.md 7.9). Never third-party logos.
export function MediaBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="ui-media-badges" aria-label="Media badges">
      {badges.map((badge) => <li key={badge}>{badge}</li>)}
    </ul>
  );
}
