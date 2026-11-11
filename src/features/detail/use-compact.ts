import { useEffect, useState } from "react";

const COMPACT_QUERY = "(max-width: 719px)";

function matches(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(COMPACT_QUERY).matches;
}

// True on compact windows, where the header stacks the art above the text.
export function useCompact(): boolean {
  const [compact, setCompact] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}
