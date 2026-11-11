import { useEffect, type ReactNode } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import "./library.css";

const SIGN_IN_ROUTE = "#/next/sign-in";

// The frame of a library or collection page. Signed-out visitors go to sign-in.
export function LibraryPage({ children }: { children: (gateway: SessionGateway) => ReactNode }) {
  const { gateway } = useSession();

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return <main className="library-page">{gateway ? children(gateway) : null}</main>;
}
