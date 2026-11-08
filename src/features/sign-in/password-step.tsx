import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionGateway } from "../../app/session";
import { errorMessage, isAbort, Shell } from "./sign-in-shell";

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

  useEffect(() => () => controller.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Shell kicker="STEP 02 / SIGN IN" title="Sign in with your password">
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="sign-in-username">Username</label>
        <input
          id="sign-in-username"
          autoFocus
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onBack}>Change server</button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
