import { SignInFailure } from "../../domain/sign-in-failure";
import { classifyTransportError } from "../../lib/transport-error";

export const WRONG_PASSWORD_COPY = "That username and password didn't work.";
export const GENERIC_COPY = "Something went wrong. Try again.";

export function unreachableCopy(address: string): string {
  return `Couldn't reach ${address}. Check the address and that the server is running.`;
}

export function isAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "CanceledError";
}

function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { response?: { status?: unknown } }).response?.status === 401;
}

interface CopyOptions {
  // The server origin, never a path or credentials. Without it no unreachable row applies.
  address?: string;
  // True only on the password step: a 401 elsewhere means no credentials were entered.
  afterCredentials?: boolean;
}

// The only source of error text in sign-in. A transport message never reaches the screen.
export function signInErrorCopy(error: unknown, options: CopyOptions = {}): string {
  if (error instanceof SignInFailure) return error.message;
  if (options.afterCredentials && isUnauthorized(error)) return WRONG_PASSWORD_COPY;
  if (options.address !== undefined && classifyTransportError(error) === "network") return unreachableCopy(options.address);
  return GENERIC_COPY;
}
