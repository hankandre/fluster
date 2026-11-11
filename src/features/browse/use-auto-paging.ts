import { useEffect, useRef, useState } from "react";

// Calls `onLoad` while a sentinel element sits within one viewport below the visible area. Place the returned
// ref on an element after the grid. After each page `enabled` flips back on, so a sentinel that is still near
// loads the next page too. Without IntersectionObserver nothing loads by itself; the Load more button remains.
export function useAutoPaging({ enabled, onLoad }: { enabled: boolean; onLoad(): void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const load = useRef(onLoad);
  load.current = onLoad;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setNear(last.isIntersecting);
    }, { rootMargin: "0px 0px 100% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (near && enabled) load.current();
  }, [near, enabled]);

  return sentinel;
}
