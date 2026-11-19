import { useOptionalToast } from "../shared/ui";
import { useSession } from "../../app/session";

// Sign out from the player, once playback has stopped and the viewer has left it: clears the session at once,
// shows "Signed out" on the sign-in screen, and revokes the sign-in on the server only after `revokeAfter` (the
// Stopped report) has settled.
export function useSignOutAfterStop(): (revokeAfter: Promise<unknown>) => void {
  const session = useSession();
  const toast = useOptionalToast();
  return (revokeAfter) => {
    toast?.show({ message: "Signed out", tone: "ok", holdWhileSuppressed: true });
    void session.signOut({ revokeAfter });
  };
}
