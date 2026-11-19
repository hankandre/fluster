import { useRef } from "react";
import { Button, Dialog } from "../shared/ui";

// The confirm the player's Settings sheet shows before Sign out: it ends what the viewer is watching. The page's
// Sign out has no confirm (DESIGN.md 7.18). Cancel takes focus first, the safe action.
export function SignOutConfirm({ open, onCancel, onConfirm }: { open: boolean; onCancel(): void; onConfirm(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Stop playback and sign out?"
      role="alertdialog"
      closeOnVeil={false}
      initialFocus={cancel}
      actions={(
        <>
          <Button variant="secondary" ref={cancel} onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Sign out</Button>
        </>
      )}
    >
      Playback stops and you'll need to sign in again to use this server.
    </Dialog>
  );
}
