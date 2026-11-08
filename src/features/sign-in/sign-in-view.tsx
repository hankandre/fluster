import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import { DISCOVERED_ID_MISMATCH_MESSAGE, sameServerId, type DiscoveredServer, type ServerDiscovery } from "../../domain/server-discovery";
import { PasswordStep } from "./password-step";
import { ServerDiscoveryPanel } from "./server-discovery";
import { errorMessage, isAbort, ServerOrigin, Shell } from "./sign-in-shell";

export const QUICK_CONNECT_POLL_MS = 2_000;
const HOME_ROUTE = "#/next/home";

type Stage =
  | { name: "server" }
  | { name: "confirm-unencrypted"; gateway: SessionGateway; serverName: string }
  | { name: "quick-connect"; gateway: SessionGateway }
  | { name: "password"; gateway: SessionGateway };

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { response?: { status?: unknown } }).response?.status === 404;
}

const MAX_POLL_FAILURES = 3;

// A failed Quick Connect check only means the password form is used.
async function chooseSignInStage(gateway: SessionGateway, signal: AbortSignal): Promise<Stage> {
  const quickConnect = await gateway.quickConnectEnabled(signal).catch(() => false);
  return { name: quickConnect ? "quick-connect" : "password", gateway };
}

// `discovery` is present only in the desktop shell.
export function SignInView({ discovery }: { discovery?: ServerDiscovery } = {}) {
  const session = useSession();
  const [stage, setStage] = useState<Stage>({ name: "server" });

  function finishSignIn(gateway: SessionGateway) {
    session.signIn(gateway);
    window.location.hash = HOME_ROUTE;
  }

  switch (stage.name) {
    case "server":
      return <ServerStep discovery={discovery} onConnected={setStage} />;
    case "confirm-unencrypted":
      return (
        <ConfirmUnencryptedStep
          gateway={stage.gateway}
          serverName={stage.serverName}
          onConfirmed={setStage}
          onCancel={() => setStage({ name: "server" })}
        />
      );
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

function ServerStep({ discovery, onConnected }: { discovery?: ServerDiscovery; onConnected: (stage: Stage) => void }) {
  const session = useSession();
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void connectTo(serverUrl);
  }

  // A discovered address goes through the same probe and confirmation, and
  // the probe must report the Id that answered discovery.
  function choose(server: DiscoveredServer) {
    setServerUrl(server.address);
    void connectTo(server.address, server.id);
  }

  async function connectTo(url: string, discoveredId?: string) {
    setError("");
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // A public http:// address throws here, before any request is sent.
      const gateway = session.createGateway(url);
      const server = await gateway.connect(abort.signal);
      if (discoveredId !== undefined && !sameServerId(discoveredId, server.id)) {
        setError(DISCOVERED_ID_MISMATCH_MESSAGE);
        setBusy(false);
        return;
      }
      if (server.needsUnencryptedConfirmation) {
        onConnected({ name: "confirm-unencrypted", gateway, serverName: server.name });
        return;
      }
      onConnected(await chooseSignInStage(gateway, abort.signal));
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
      {discovery && <ServerDiscoveryPanel discovery={discovery} disabled={busy} onChoose={choose} />}
    </Shell>
  );
}

// Shown once per server Id and origin before a password, Quick Connect
// secret, or token goes to a private-LAN server over plain HTTP
// (docs/decisions/0001). Cancel is the default.
function ConfirmUnencryptedStep({
  gateway,
  serverName,
  onConfirmed,
  onCancel,
}: {
  gateway: SessionGateway;
  serverName: string;
  onConfirmed: (stage: Stage) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  const cancelled = useRef(onCancel);
  cancelled.current = onCancel;

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      controller.current?.abort();
      cancelled.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function confirm() {
    setError("");
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      gateway.confirmUnencryptedConnection();
      onConfirmed(await chooseSignInStage(gateway, abort.signal));
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function cancel() {
    controller.current?.abort();
    onCancel();
  }

  return (
    <Shell kicker="STEP 01 / CONNECTION" title="This server uses an unencrypted connection." titleId="unencrypted-title">
      <div role="alertdialog" aria-labelledby="unencrypted-title" aria-describedby="unencrypted-description">
        <p id="unencrypted-description" className="lede">
          Your Jellyfin password and sign-in token will travel across your network without encryption.
          Anyone else on this network could read them and use your account.
          Continue only on a network you trust, such as your home network.
          Fluster will remember this choice for “{serverName}” at <code>{gateway.origin}</code>.
        </p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="text-button" disabled={busy} onClick={confirm}>
            {busy ? "Connecting…" : "Connect without encryption"}
          </button>
          <button type="button" className="primary-button" autoFocus onClick={cancel}>Cancel</button>
        </div>
      </div>
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
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | undefined>(undefined);
  // Keep the latest callback without restarting the polling effect.
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    async function run() {
      let failures = 0;
      try {
        const request = await gateway.initiateQuickConnect(abort.signal);
        setCode(request.code);
        for (;;) {
          await sleep(QUICK_CONNECT_POLL_MS, abort.signal);
          let state: { authenticated: boolean };
          try {
            state = await gateway.pollQuickConnect(request.secret, abort.signal);
            failures = 0;
          } catch (caught) {
            if (isAbort(caught) || abort.signal.aborted) return;
            if (isNotFound(caught)) {
              setExpired(true);
              return;
            }
            failures += 1;
            if (failures >= MAX_POLL_FAILURES) throw caught;
            continue;
          }
          if (!state.authenticated) continue;
          await gateway.authenticateWithQuickConnect(request.secret, abort.signal);
          if (abort.signal.aborted) {
            void gateway.logout().catch(() => undefined);
            return;
          }
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
  }, [gateway, attempt]);

  function restart() {
    setCode("");
    setError("");
    setExpired(false);
    setAttempt((value) => value + 1);
  }

  function cancel() {
    controller.current?.abort();
    onCancel();
  }

  return (
    <Shell kicker="STEP 02 / QUICK CONNECT" title="Approve on another device">
      <ServerOrigin origin={gateway.origin} />
      <p className="lede">
        In Jellyfin on a signed-in device, open Quick Connect and enter this code.
      </p>
      <p className="quick-connect-code" aria-label="Quick Connect code" data-testid="quick-connect-code">
        {code || "…"}
      </p>
      {expired ? (
        <p role="alert" className="form-error">
          This code expired. Start again.{" "}
          <button type="button" className="text-button" onClick={restart}>Start again</button>
        </p>
      ) : error ? (
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
