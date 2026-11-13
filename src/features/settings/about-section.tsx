import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import type { HostClass } from "../../domain/host-class";
import { lastDecode } from "../player/last-decode";
import { usePlayerStatus, type PlayerStatus } from "../player/player-status";
import { Button, InlineError, SettingsRow, SettingsSection, Skeleton, useSettingsRow, useToast } from "../shared/ui";
import { diagnosticsText, libmpvVersionText, osName, safeServerVersion, safeValue, type DiagnosticsInput } from "./diagnostics";
import { useServerInfo } from "./use-server-info";

function playerInput(status: PlayerStatus): DiagnosticsInput["player"] {
  if (status.kind === "checking") return { kind: "checking" };
  if (status.kind === "unavailable") return { kind: "unavailable" };
  if (status.capabilities.mode === "browser") return { kind: "browser" };
  return { kind: "native", libmpvVersion: status.capabilities.libmpvVersion, renderer: status.capabilities.nativeRenderer };
}

function playerText(status: PlayerStatus): string {
  switch (status.kind) {
    case "checking":
      return "Checking…";
    case "unavailable":
      return "Not available";
    case "ready":
      return status.capabilities.mode === "browser"
        ? "Browser (development)"
        : `Native, libmpv ${libmpvVersionText(status.capabilities.libmpvVersion)}`;
  }
}

function rendererText(status: PlayerStatus): string {
  return status.kind === "ready" && status.capabilities.mode === "native" ? safeValue(status.capabilities.nativeRenderer) : "Unknown";
}

export function AboutSection() {
  const { gateway } = useSession();
  return gateway ? <SignedInAbout gateway={gateway} /> : <AboutBody />;
}

function SignedInAbout({ gateway }: { gateway: SessionGateway }) {
  const server = useServerInfo(gateway);
  const version = server.isPending ? undefined : server.data?.version;
  return <AboutBody server={{ pending: server.isPending, version, hostClass: gateway.hostClass }} />;
}

interface ServerPart {
  pending: boolean;
  version: string | undefined;
  hostClass: HostClass;
}

// Without a session there is no server to describe, so the server rows and Copy are left out.
function AboutBody({ server }: { server?: ServerPart }) {
  const { status } = usePlayerStatus();
  const toast = useToast();
  const [fallback, setFallback] = useState<string | undefined>();
  const pre = useRef<HTMLPreElement>(null);
  const mono = (text: ReactNode) => <span className="settings-mono">{text}</span>;

  async function copy() {
    if (!server) return;
    const text = diagnosticsText({
      appVersion: __APP_VERSION__,
      os: osName(navigator.userAgent),
      player: playerInput(status),
      decode: lastDecode(),
      serverVersion: server.version,
      hostClass: server.hostClass,
    });
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setFallback(undefined);
      toast.show({ message: "Diagnostics copied", tone: "ok" });
    } catch {
      setFallback(text);
    }
  }

  // The text is shown selected so Ctrl+C works when the clipboard refuses.
  useEffect(() => {
    if (fallback === undefined || !pre.current) return;
    pre.current.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.selectAllChildren(pre.current);
  }, [fallback]);

  const footer =
    fallback === undefined ? undefined : (
      <>
        <div className="settings-alert"><InlineError message="Couldn't copy. Select the text below and copy it." /></div>
        <pre className="settings-diagnostics" ref={pre} tabIndex={0} aria-label="Diagnostics">{fallback}</pre>
      </>
    );

  return (
    <SettingsSection title="About & diagnostics" footer={footer}>
      <SettingsRow label="Version" value={mono(`Fluster ${safeValue(__APP_VERSION__)}`)} />
      <SettingsRow label="Player" value={mono(playerText(status))} />
      <SettingsRow label="Renderer" value={mono(rendererText(status))} />
      {server ? (
        <SettingsRow
          label="Jellyfin server"
          value={mono(server.pending ? <Skeleton shape="line" width="4rem" height="1em" /> : safeServerVersion(server.version))}
        />
      ) : null}
      {server ? (
        <SettingsRow
          label="Copy diagnostics"
          description="Copies a short report for bug reports. It leaves out your server's name and address and your user name."
        >
          <CopyButton onCopy={() => void copy()} />
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}

function CopyButton({ onCopy }: { onCopy(): void }) {
  const { descriptionId } = useSettingsRow();
  return <Button variant="secondary" data-roving-item="" aria-describedby={descriptionId} onClick={onCopy}>Copy</Button>;
}
