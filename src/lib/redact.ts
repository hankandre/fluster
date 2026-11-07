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

// Catches credentials that are not inside an absolute URL, such as relative
// request paths, bare query strings, and quoted Jellyfin authorization values.
function redactCredentialPairs(value: string): string {
  return value
    .replace(/(\b(?:api[_-]?key|access[_-]?token|token|password|pw)=)"?[^&\s",]+"?/gi, "$1[redacted]")
    .replace(/(\bx-emby-token\s*[:=]\s*)"?[^&\s",]+"?/gi, "$1[redacted]");
}

export function redactText(value: string): string {
  const withoutUrls = value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s\"']+/gi, (url) => redactUrl(url));
  return redactCredentialPairs(withoutUrls);
}

// Redacts an error's message in place so callers keep its type and identity
// (for example AbortError checks) while no URL or token can be surfaced.
export function redactError(error: unknown): unknown {
  if (error instanceof Error) error.message = redactText(error.message);
  return error;
}
