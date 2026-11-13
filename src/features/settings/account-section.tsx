import type { ReactNode } from "react";
import { useSession } from "../../app/session";
import { Button, SettingsRow, SettingsSection, Skeleton, useSettingsRow, useToast } from "../shared/ui";
import { useServerInfo } from "./use-server-info";

// Without a signed-in gateway there is nothing to show; Playback still works.
export function AccountSection() {
  const { gateway } = useSession();
  if (!gateway) return <SettingsSection title="Account" />;
  return <SignedInAccount />;
}

function SignedInAccount() {
  const session = useSession();
  const toast = useToast();
  const gateway = session.gateway!;
  const server = useServerInfo(gateway);

  async function signOut() {
    window.location.hash = "#/next/sign-in";
    toast.show({ message: "Signed out", tone: "ok" });
    await session.signOut();
  }

  let serverName: ReactNode;
  if (server.isPending) serverName = <Skeleton shape="line" width="8rem" height="1em" />;
  else if (server.data?.name) serverName = server.data.name;

  return (
    <SettingsSection title="Account">
      <SettingsRow label="Server" description={<span className="settings-mono">{gateway.serverUrl}</span>} value={serverName} />
      <SettingsRow label="User" value={gateway.currentUserName() ?? "Unknown"} />
      <SettingsRow label="Stay signed in" unavailable="P3-02" />
      <SettingsRow label="Sign out" description="You'll need to sign in again to use this server.">
        <SignOutButton onSignOut={() => void signOut()} />
      </SettingsRow>
    </SettingsSection>
  );
}

function SignOutButton({ onSignOut }: { onSignOut(): void }) {
  const { descriptionId } = useSettingsRow();
  return <Button variant="danger" data-roving-item="" aria-describedby={descriptionId} onClick={onSignOut}>Sign out</Button>;
}
