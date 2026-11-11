import { CircleAlert } from "lucide-react";
import { useRovingFocus } from "../../roving-focus";
import { Button } from "./button";
import "./feedback.css";

interface InlineErrorProps {
  // One sentence that names the problem, such as "Couldn't load Latest in Movies."
  message: string;
  onRetry?(): void;
  retryLabel?: string;
  // Makes Retry a spatial row of its own, so Up and Down reach it on pages that navigate by arrow keys.
  spatial?: boolean;
}

// Replaces the content that failed to load.
export function InlineError({ message, onRetry, retryLabel = "Retry", spatial = false }: InlineErrorProps) {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  const retry = onRetry ? (
    <Button variant="secondary" onClick={onRetry} {...(spatial ? { "data-roving-item": "" } : {})}>{retryLabel}</Button>
  ) : null;
  return (
    <div className="ui-inline-error" role="alert">
      <CircleAlert className="ui-inline-error-icon" aria-hidden="true" size={20} />
      <p className="ui-inline-error-message">{message}</p>
      {spatial && retry ? (
        <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>{retry}</div>
      ) : retry}
    </div>
  );
}
