import { useEffect, type ReactNode } from "react";
import { useSession } from "../../app/session";
import { SIGN_IN_ROUTE } from "../routes";

// Sends a signed-out viewer to sign-in. The only copy of this redirect (P2-10). `hash` is a dependency
// because one guard instance stays mounted across guarded routes.
export function SignInGuard({ hash, children }: { hash: string; children: ReactNode }) {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway, hash]);

  return gateway ? <>{children}</> : null;
}
