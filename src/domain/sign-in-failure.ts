export type SignInFailureKind =
  | "invalid-address"
  | "public-http"
  | "redirect"
  | "unsupported-version"
  | "unexpected-response"
  | "not-confirmed";

// A fixed, plain sentence written in the gateway, safe to show as it is. The
// redirect kind is also thrown from signed-in calls; no caller inspects the class there.
export class SignInFailure extends Error {
  constructor(readonly kind: SignInFailureKind, message: string) {
    super(message);
    this.name = "SignInFailure";
  }
}
