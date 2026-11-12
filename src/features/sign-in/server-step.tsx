import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import { DISCOVERED_ID_MISMATCH_MESSAGE, sameServerId, type DiscoveredServer } from "../../domain/server-discovery";
import { Button, Dialog, InlineError, TextField } from "../shared/ui";
import { ServerList } from "./server-discovery";
import { isAbort, signInErrorCopy } from "./sign-in-errors";
import { chooseSignInStage, type Stage } from "./sign-in-stage";
import { StepShell } from "./step-shell";
import type { ServerSearch } from "./use-server-discovery";

interface Pending {
  gateway: SessionGateway;
  serverName: string;
}

export function ServerStep({ search, onConnected }: { search?: ServerSearch; onConnected: (stage: Stage) => void }) {
  const session = useSession();
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
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
    let address: string | undefined;
    try {
      // A public http:// address throws here, before any request is sent.
      const gateway = session.createGateway(url);
      address = gateway.origin;
      const server = await gateway.connect(abort.signal);
      if (discoveredId !== undefined && !sameServerId(discoveredId, server.id)) {
        setError(DISCOVERED_ID_MISMATCH_MESSAGE);
        setBusy(false);
        return;
      }
      if (server.needsUnencryptedConfirmation) {
        setPending({ gateway, serverName: server.name });
        return;
      }
      onConnected(await chooseSignInStage(gateway, abort.signal));
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(signInErrorCopy(caught, { address }));
      setBusy(false);
    }
  }

  function cancel() {
    controller.current?.abort();
    setPending(undefined);
    setBusy(false);
  }

  return (
    <StepShell title="Where is your Jellyfin server?">
      {search && <ServerList search={search} busy={busy} onChoose={choose} />}
      <form className="sign-in-form" onSubmit={submit}>
        {search && <p className="sign-in-note">Or enter its address</p>}
        <TextField
          label="Server URL"
          type="url"
          autoFocus
          required
          placeholder="https://jellyfin.example.com"
          value={serverUrl}
          error={error || undefined}
          onChange={(event) => setServerUrl(event.target.value)}
        />
        <div className="sign-in-actions">
          <span />
          {/* aria-disabled, not disabled: the dialog returns focus to this button on cancel. */}
          <Button variant="primary" type="submit" aria-disabled={busy ? true : undefined}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </form>
      {pending && (
        <UnencryptedDialog
          pending={pending}
          onConfirmed={onConnected}
          onCancel={cancel}
          controller={controller}
        />
      )}
    </StepShell>
  );
}

// Shown once per server Id and origin before a password, Quick Connect
// secret, or token goes to a private-LAN server over plain HTTP
// (docs/decisions/0001). Cancel is the default.
function UnencryptedDialog({
  pending,
  onConfirmed,
  onCancel,
  controller,
}: {
  pending: Pending;
  onConfirmed: (stage: Stage) => void;
  onCancel: () => void;
  controller: { current: AbortController | undefined };
}) {
  const { gateway, serverName } = pending;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const cancelButton = useRef<HTMLButtonElement>(null);

  async function confirm() {
    setError("");
    setConfirming(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // chooseSignInStage swallows an abort, so check the signal. Consent is
      // stored only once the choice proceeds, and before any sign-in request
      // (the Quick Connect check sends no credential).
      const stage = await chooseSignInStage(gateway, abort.signal);
      if (abort.signal.aborted) return;
      gateway.confirmUnencryptedConnection();
      onConfirmed(stage);
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(signInErrorCopy(caught, { address: gateway.origin }));
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title="This server uses an unencrypted connection."
      icon={<TriangleAlert size={24} />}
      initialFocus={cancelButton}
      closeOnVeil={false}
      onClose={onCancel}
      actions={
        <>
          <Button variant="quiet" disabled={confirming} onClick={confirm}>
            {confirming ? "Connecting…" : "Connect without encryption"}
          </Button>
          <Button variant="primary" ref={cancelButton} onClick={onCancel}>Cancel</Button>
        </>
      }
    >
      <p>
        Your Jellyfin password and sign-in token will travel across your network without encryption.
        Anyone else on this network could read them and use your account.
        Continue only on a network you trust, such as your home network.
        Fluster will remember this choice for “{serverName}” at <code className="sign-in-mono">{gateway.origin}</code>.
      </p>
      {error && <InlineError message={error} />}
    </Dialog>
  );
}
