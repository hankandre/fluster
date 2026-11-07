const SENSITIVE_KEYS = /^(api[_-]?key|access[_-]?token|x-emby-token|token|password|pw)$/i;

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = "[redacted]";
    if (url.password) url.password = "[redacted]";
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, SENSITIVE_KEYS.test(key) ? "[redacted]" : "[omitted]");
    }
    return url.toString();
  } catch {
    return redactCredentialPairs(value);
  }
}

// Catches credentials that are not inside an absolute URL: relative request
// paths, bare query strings, headers, and JSON bodies. Key names may carry a
// prefix (auth_token, sessionToken, X-MediaBrowser-Token) and be quoted.
function redactCredentialPairs(value: string): string {
  return value
    .replace(/(authorization"?\s*[:=]\s*)[^\n]*/gi, "$1[redacted]")
    .replace(
      /((?:[\w-]*(?:api[_-]?key|access[_-]?token|token|password|playsessionid)|\bpw)"?\s*[:=]\s*)"?[^&\s",}]+"?/gi,
      "$1[redacted]",
    );
}

export function redactText(value: string): string {
  const withoutUrls = value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s\"']+/gi, (url) => redactUrl(url));
  return redactCredentialPairs(withoutUrls);
}

// Redacts an error's message in place so callers keep its type and identity
// (for example AbortError checks) while no URL or token can be surfaced. Some
// errors have a read-only message (DOMException, frozen errors); those are
// replaced by a new Error that keeps the original name.
export function redactError(error: unknown): unknown {
  // DOMException is not an Error subclass in every runtime, so accept any
  // object with a string message.
  if (typeof error !== "object" || error === null) return error;
  const candidate = error as { message?: unknown; name?: unknown };
  if (typeof candidate.message !== "string") return error;
  const redacted = redactText(candidate.message);
  if (redacted === candidate.message) return error;
  try {
    candidate.message = redacted;
    if (candidate.message === redacted) return error;
  } catch {
    // Fall through to the replacement below.
  }
  const replacement = new Error(redacted);
  if (typeof candidate.name === "string") replacement.name = candidate.name;
  return replacement;
}
