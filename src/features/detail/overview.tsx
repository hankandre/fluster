import { useId, useLayoutEffect, useRef, useState } from "react";
import { useRovingFocus } from "../roving-focus";
import { Button } from "../shared/ui";

// The overview, clamped to three lines. When the text is longer, a quiet "More" button opens it (DESIGN.md 7.7).
export function Overview({ text }: { text: string }) {
  const id = useId();
  const paragraph = useRef<HTMLParagraphElement>(null);
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return undefined;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  return (
    <>
      <p id={id} ref={paragraph} className="detail-overview" data-expanded={expanded ? "true" : undefined}>{text}</p>
      {overflows ? (
        <div className="detail-overview-more" data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
          <Button variant="quiet" aria-expanded={expanded} aria-controls={id} data-roving-item="" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Less" : "More"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
