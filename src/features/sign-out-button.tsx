import { useSession } from "../app/session";

// Shown only while signed in; revokes the server session, then returns to sign-in.
export function SignOutButton() {
  const session = useSession();
  if (!session.gateway) return null;

  async function signOut() {
    window.location.hash = "#/next/sign-in";
    await session.signOut();
  }

  return <button type="button" onClick={() => void signOut()}>Sign out</button>;
}
