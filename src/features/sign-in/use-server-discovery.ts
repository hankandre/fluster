import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryResult, ServerDiscovery } from "../../domain/server-discovery";

export type DiscoveryState =
  | { name: "idle" }
  | { name: "searching" }
  | { name: "found"; result: DiscoveryResult }
  | { name: "failed" };

export interface ServerSearch {
  state: DiscoveryState;
  searchAgain(): void;
}

// Searches the network once when the sign-in screen opens, then on "Search
// again". Without a port (browser mode) it stays idle and returns undefined.
export function useServerDiscovery(discovery?: ServerDiscovery): ServerSearch | undefined {
  const [state, setState] = useState<DiscoveryState>({ name: "idle" });
  // StrictMode runs the mount effect twice in development, and the native side
  // refuses a second search while one runs. The cleanup does nothing, so the
  // one search's result still lands in state.
  const started = useRef(false);
  const running = useRef(false);

  const search = useCallback(async () => {
    if (!discovery || running.current) return;
    running.current = true;
    setState({ name: "searching" });
    try {
      setState({ name: "found", result: await discovery.discover() });
    } catch {
      // The adapter already uses fixed text; never show anything else.
      setState({ name: "failed" });
    } finally {
      running.current = false;
    }
  }, [discovery]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void search();
  }, [search]);

  if (!discovery) return undefined;
  return { state, searchAgain: () => void search() };
}
