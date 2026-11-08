import { useCallback, useEffect, useState } from "react";
import { useOptionalPlayerServices } from "../../app/player-services";
import type { PlayerCapabilities, PlayerEngine } from "../../domain/playback";
import { redactText } from "../../lib/redact";

// What the app knows about the player before anything plays.
export type PlayerStatus =
  | { kind: "checking" }
  | { kind: "ready"; capabilities: PlayerCapabilities }
  | { kind: "unavailable"; reason: string };

const CHECKING: PlayerStatus = { kind: "checking" };
const UNKNOWN_REASON = "The player did not say why it cannot start.";

// One initialize() per engine, so the whole app run shares one answer. A
// failure is not kept: starting the player may succeed on a later try.
const checks = new WeakMap<PlayerEngine, Promise<PlayerStatus>>();
// Answers already known, so a later view starts with them instead of "checking".
const known = new WeakMap<PlayerEngine, PlayerStatus>();

function reasonOf(error: unknown): string {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return text.trim() ? redactText(text) : UNKNOWN_REASON;
}

export function checkPlayer(engine: PlayerEngine): Promise<PlayerStatus> {
  const earlier = checks.get(engine);
  if (earlier) return earlier;
  const check = engine.initialize().then(
    (capabilities): PlayerStatus => {
      const ready: PlayerStatus = { kind: "ready", capabilities };
      known.set(engine, ready);
      return ready;
    },
    (error: unknown): PlayerStatus => {
      checks.delete(engine);
      return { kind: "unavailable", reason: reasonOf(error) };
    },
  );
  checks.set(engine, check);
  return check;
}

// The player's status, checked when the view mounts. Without a player
// (no provider) the status stays "checking" and nothing is claimed.
export function usePlayerStatus(): { status: PlayerStatus; recheck(): void } {
  const engine = useOptionalPlayerServices()?.engine;
  const [status, setStatus] = useState<PlayerStatus>(() => (engine && known.get(engine)) || CHECKING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!engine) return;
    let current = true;
    void checkPlayer(engine).then((result) => {
      if (current) setStatus(result);
    });
    return () => {
      current = false;
    };
  }, [engine, attempt]);

  const recheck = useCallback(() => {
    setStatus(CHECKING);
    setAttempt((count) => count + 1);
  }, []);
  return { status, recheck };
}
