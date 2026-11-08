import { CircleAlert } from "lucide-react";
import { Button } from "./button";
import "./feedback.css";

interface InlineErrorProps {
  // One sentence that names the problem, such as "Couldn't load Latest in Movies."
  message: string;
  onRetry?(): void;
  retryLabel?: string;
}

// Replaces the content that failed to load.
export function InlineError({ message, onRetry, retryLabel = "Retry" }: InlineErrorProps) {
  return (
    <div className="ui-inline-error" role="alert">
      <CircleAlert className="ui-inline-error-icon" aria-hidden="true" size={20} />
      <p className="ui-inline-error-message">{message}</p>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}
