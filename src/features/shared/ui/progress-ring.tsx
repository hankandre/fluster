const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// A decorative 18 px ring for a resume fraction (0 to 1), drawn in the button's text colour. The label carries
// the position, so the ring is hidden from assistive technology.
export function ProgressRing({ value }: { value: number }) {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <svg className="ui-progress-ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="4" opacity="0.3" />
      <circle
        cx="9"
        cy="9"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
