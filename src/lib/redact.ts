const SENSITIVE_KEYS = /^(api[_-]?key|access[_-]?token|token|password|pw)$/i;

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
    return value.replace(/([?&](?:api[_-]?key|access[_-]?token|token|password|pw)=)[^&\s]+/gi, "$1[redacted]");
  }
}

export function redactText(value: string): string {
  return value
    .replace(/(MediaBrowser[^\n]*?Token=)[^,\s\"]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s\"']+/gi, (url) => redactUrl(url));
}
