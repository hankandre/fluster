import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { SignInGuard } from "./sign-in-guard";

beforeEach(() => {
  window.location.hash = "#/next/home";
});

afterEach(cleanup);

function SessionButtons({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return (
    <>
      <button onClick={() => session.signIn(gateway)}>test sign in</button>
      <button onClick={() => void session.signOut()}>test sign out</button>
    </>
  );
}

function Child() {
  return <p>guarded child</p>;
}

function renderGuard(gateway: SessionGateway, hash: string) {
  const tree = (current: string) => (
    <SessionProvider createGateway={() => gateway}>
      <SessionButtons gateway={gateway} />
      <SignInGuard hash={current}><Child /></SignInGuard>
    </SessionProvider>
  );
  const view = render(tree(hash));
  return { rerenderAt: (next: string) => view.rerender(tree(next)) };
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("SignInGuard", () => {
  it("sends a signed-out viewer to sign-in and renders nothing", () => {
    renderGuard(fakeSessionGateway(), "#/next/home");
    expect(window.location.hash).toBe("#/next/sign-in");
    expect(screen.queryByText("guarded child")).not.toBeInTheDocument();
  });

  it("renders the children for a signed-in viewer and leaves the hash alone", async () => {
    renderGuard(fakeSessionGateway(), "#/next/home");
    window.location.hash = "#/next/home";
    await click("test sign in");
    expect(screen.getByText("guarded child")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/next/home");
  });

  it("redirects when the viewer signs out while on a guarded route", async () => {
    renderGuard(fakeSessionGateway(), "#/next/home");
    await click("test sign in");
    window.location.hash = "#/next/home";
    await click("test sign out");
    expect(window.location.hash).toBe("#/next/sign-in");
    expect(screen.queryByText("guarded child")).not.toBeInTheDocument();
  });

  it("redirects again when a signed-out viewer moves to another guarded route", () => {
    const { rerenderAt } = renderGuard(fakeSessionGateway(), "#/next/home");
    window.location.hash = "#/next/search";
    rerenderAt("#/next/search");
    expect(window.location.hash).toBe("#/next/sign-in");
  });
});

// Acceptance for P2-10: the redirect has one copy. Only the route table, the guard, the focus-return reset,
// and Settings' sign-out name the sign-in route inside src/features.
const featuresDir = join(__dirname, "..");
const ALLOWED = ["routes.ts", "shell/sign-in-guard.tsx", "shell/focus-return.ts", "settings/account-section.tsx"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("sign-in route reach", () => {
  const files = sourceFiles(featuresDir).map((file) => relative(featuresDir, file).split("\\").join("/"));

  it("finds the feature files", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const allowed of ALLOWED) expect(files).toContain(allowed);
  });

  it("names SIGN_IN_ROUTE only where it is allowed", () => {
    const offenders = files.filter((file) => readFileSync(join(featuresDir, file), "utf8").includes("SIGN_IN_ROUTE") && !ALLOWED.includes(file));
    expect(offenders).toEqual([]);
  });
});
