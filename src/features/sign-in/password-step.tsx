import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionGateway } from "../../app/session";
import { Button, InlineError, TextField } from "../shared/ui";
import { isTvForm } from "../shared/tv-form";
import { useEscapeKey } from "../use-escape-key";
import { isAbort, signInErrorCopy } from "./sign-in-errors";
import { StepShell } from "./step-shell";

export function PasswordStep({
  gateway,
  onSignedIn,
  onBack,
}: {
  gateway: SessionGateway;
  onSignedIn: () => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  const usernameField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  // Escape outside a field is "Change server" (DESIGN.md 9).
  useEscapeKey(onBack);

  useEffect(() => () => controller.current?.abort(), []);

  // A passive effect, not autoFocus: after "Connect without encryption" the
  // dialog lifts its inert page in a passive cleanup, which runs before this.
  useEffect(() => {
    usernameField.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await gateway.login(username, password, abort.signal);
      if (abort.signal.aborted) {
        void gateway.logout().catch(() => undefined);
        return;
      }
      onSignedIn();
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(signInErrorCopy(caught, { address: gateway.origin, afterCredentials: true }));
      setBusy(false);
    }
  }

  return (
    <StepShell title="Who is signing in?" origin={gateway.origin}>
      <form className="sign-in-form" onSubmit={submit}>
        <TextField
          ref={usernameField}
          label="Username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          onKeyDown={(event) => {
            // A TV keyboard sends Enter for "next": move on instead of submitting.
            if (event.key === "Enter" && isTvForm()) {
              event.preventDefault();
              passwordField.current?.focus();
            }
          }}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          ref={passwordField}
          label="Password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <InlineError message={error} />}
        <div className="sign-in-actions">
          <Button variant="quiet" onClick={onBack}>Change server</Button>
          <Button variant="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </div>
      </form>
    </StepShell>
  );
}
