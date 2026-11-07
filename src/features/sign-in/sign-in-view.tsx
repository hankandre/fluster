import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSession, type SessionGateway } from "../../app/session";

export const QUICK_CONNECT_POLL_MS = 2_000;
const HOME_ROUTE = "#/next/home";

type Stage =
  | { name: "server" }
  | { name: "quick-connect"; gateway: SessionGateway }
  | { name: "password"; gateway: SessionGateway };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export function SignInView() {
  const session = useSession();
  const [stage, setStage] = useState<Stage>({ name: "server" });

  function finishSignIn(gateway: SessionGateway) {
    session.signIn(gateway);
    window.location.hash = HOME_ROUTE;
  }

  switch (stage.name) {
    case "server":
      return <ServerStep onConnected={setStage} />;
    case "quick-connect":
      return (
        <QuickConnectStep
          gateway={stage.gateway}
          onSignedIn={() => finishSignIn(stage.gateway)}
          onCancel={() => setStage({ name: "server" })}
          onUsePassword={() => setStage({ name: "password", gateway: stage.gateway })}
        />
      );
    case "password":
      return (
        <PasswordStep
          gateway={stage.gateway}
          onSignedIn={() => finishSignIn(stage.gateway)}
          onBack={() => setStage({ name: "server" })}
        />
      );
  }
}

function Shell({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <main className="content auth-content">
      <section className="auth-card">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

function ServerStep({ onConnected }: { onConnected: (stage: Stage) => void }) {
  const session = useSession();
  const [serverUrl, setServerUrl] = useState("");
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
      const gateway = session.createGateway(serverUrl);
      await gateway.connect(abort.signal);
      // A failed Quick Connect check only means the password form is used.
      const quickConnect = await gateway.quickConnectEnabled(abort.signal).catch(() => false);
      onConnected({ name: quickConnect ? "quick-connect" : "password", gateway });
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Shell kicker="STEP 01 / CONNECTION" title="Connect to Jellyfin">
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="sign-in-server-url">Server URL</label>
        <input
          id="sign-in-server-url"
          type="url"
          autoFocus
          required
          placeholder="https://jellyfin.example.com"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
        />
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions">
          <a href="#/next">Back to features</a>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
  });
}

function QuickConnectStep({
  gateway,
  onSignedIn,
  onCancel,
  onUsePassword,
}: {
  gateway: SessionGateway;
  onSignedIn: () => void;
  onCancel: () => void;
  onUsePassword: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  // Keep the latest callback without restarting the polling effect.
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    async function run() {
      try {
        const request = await gateway.initiateQuickConnect(abort.signal);
        setCode(request.code);
        for (;;) {
          await sleep(QUICK_CONNECT_POLL_MS, abort.signal);
          const state = await gateway.pollQuickConnect(request.secret, abort.signal);
          if (!state.authenticated) continue;
          await gateway.authenticateWithQuickConnect(request.secret, abort.signal);
          signedIn.current();
          return;
        }
      } catch (caught) {
        if (isAbort(caught) || abort.signal.aborted) return;
        setError(errorMessage(caught));
      }
    }
    void run();
    return () => abort.abort();
  }, [gateway]);

  function cancel() {
    controller.current?.abort();
    onCancel();
  }

  return (
    <Shell kicker="STEP 02 / QUICK CONNECT" title="Approve on another device">
      <p className="lede">
        In Jellyfin on a signed-in device, open Quick Connect and enter this code.
      </p>
      <p className="quick-connect-code" aria-label="Quick Connect code" data-testid="quick-connect-code">
        {code || "…"}
      </p>
      {error ? (
        <p role="alert" className="form-error">{error}</p>
      ) : (
        <p role="status">Waiting for approval…</p>
      )}
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onUsePassword}>Use password instead</button>
        <button type="button" className="primary-button" autoFocus onClick={cancel}>Cancel</button>
      </div>
    </Shell>
  );
}

function PasswordStep({
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
