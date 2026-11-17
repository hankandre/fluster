import type { ReactNode } from "react";
import { useSession, type SessionGateway } from "../../app/session";
import "./library.css";

// The frame of a library or collection page.
export function LibraryPage({ children }: { children: (gateway: SessionGateway) => ReactNode }) {
  const { gateway } = useSession();

  return <main className="library-page">{gateway ? children(gateway) : null}</main>;
}
