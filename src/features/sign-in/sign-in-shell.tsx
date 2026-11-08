import type { ReactNode } from "react";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "CanceledError";
}

export function Shell({ kicker, title, titleId, children }: { kicker: string; title: string; titleId?: string; children: ReactNode }) {
  return (
    <main className="content auth-content">
      <section className="auth-card">
        <p className="kicker">{kicker}</p>
        <h1 id={titleId}>{title}</h1>
        {children}
      </section>
    </main>
  );
}

// Every sign-in step names the exact origin the password or Quick Connect
// approval goes to, whether the address was typed or discovered.
export function ServerOrigin({ origin }: { origin: string }) {
  return (
    <p className="server-origin" data-testid="sign-in-origin">
      Signing in to <code>{origin}</code>
    </p>
  );
}
