import { useEffect, useRef, useState } from "react";
import type { SessionGateway } from "../../app/session";
import { Button, InlineError } from "../shared/ui";
import { QuickConnectCode } from "./quick-connect-code";
import { isAbort, signInErrorCopy } from "./sign-in-errors";
import { useEscapeKey } from "../use-escape-key";
import { StepShell } from "./step-shell";

export const QUICK_CONNECT_POLL_MS = 2_000;
const MAX_POLL_FAILURES = 3;

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { response?: { status?: unknown } }).response?.status === 404;
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

export function QuickConnectStep({
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
  const title = useRef<HTMLHeadingElement>(null);
  // Keep the latest callback without restarting the polling effect.
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  // A passive effect: a screen reader starts at the title (DESIGN.md section 9).
  useEffect(() => {
    title.current?.focus();
  }, []);

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
        setError(signInErrorCopy(caught, { address: gateway.origin }));
      }
    }
    void run();
    return () => abort.abort();
  }, [gateway, attempt]);

  function restart() {
    // The retry button unmounts with its error; keep focus on the title.
    title.current?.focus();
    setCode("");
    setError("");
    setExpired(false);
    setAttempt((value) => value + 1);
  }

  function cancel() {
    controller.current?.abort();
    onCancel();
  }
  // Escape outside a field is "Change server" (DESIGN.md 9).
  useEscapeKey(cancel);

  return (
    <StepShell title="Approve this code in Jellyfin" origin={gateway.origin} titleRef={title}>
      <p className="sign-in-note">In Jellyfin on a signed-in device, open Quick Connect and enter this code.</p>
      <QuickConnectCode code={code} />
      {expired ? (
        <InlineError message="This code expired." onRetry={restart} retryLabel="Start again" />
      ) : error ? (
        <InlineError message={error} onRetry={restart} retryLabel="Start again" />
      ) : (
        <p role="status" className="sign-in-note">Waiting for approval…</p>
      )}
      <div className="sign-in-actions">
        <Button variant="quiet" onClick={cancel}>Change server</Button>
        <Button variant="secondary" onClick={onUsePassword}>Use password</Button>
      </div>
    </StepShell>
  );
}
