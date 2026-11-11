import { useEffect, useRef, type ReactNode } from "react";
import { useSession, type SessionGateway } from "../../app/session";

const SIGN_IN_ROUTE = "#/next/sign-in";

// The search page frame until P13-12 redesigns it. Signed-out visitors go to sign-in.
export function SearchFrame({ title, routeKey, children }: { title: string; routeKey: string; children: (gateway: SessionGateway) => ReactNode }) {
  const { gateway } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the page heading when the route changes.
  useEffect(() => {
    heading.current?.focus();
  }, [routeKey]);

  useEffect(() => {
    if (!gateway) window.location.hash = SIGN_IN_ROUTE;
  }, [gateway]);

  return (
    <main className="home">
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      {gateway ? children(gateway) : null}
    </main>
  );
}
