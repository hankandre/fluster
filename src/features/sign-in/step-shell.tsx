import type { ReactNode, Ref } from "react";
import "./sign-in.css";

// One centred card per step: one question as the h1, then the step's content.
export function StepShell({
  title,
  origin,
  titleRef,
  children,
}: {
  title: string;
  origin?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <main className="content sign-in">
      <section className="sign-in-card">
        <h1 className="sign-in-title" ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h1>
        {origin !== undefined && <ServerOrigin origin={origin} />}
        {children}
      </section>
    </main>
  );
}

// Every sign-in step names the exact origin the password or Quick Connect
// approval goes to, whether the address was typed or discovered.
export function ServerOrigin({ origin }: { origin: string }) {
  return (
    <p className="sign-in-origin" data-testid="sign-in-origin">
      Signing in to <code>{origin}</code>
    </p>
  );
}
