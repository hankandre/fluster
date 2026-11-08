// Query parameter names Jellyfin (or a proxy in front of it) may read as a
// token, compared in lower case. Rust refuses the first five on every media
// URL (`CREDENTIAL_QUERY_NAMES` in src-tauri/src/player/network.rs); the last
// two are stripped as well, because the fixture scrubber found them in use.
const CREDENTIAL_QUERY_NAMES = new Set([
  "apikey",
  "api_key",
  "access_token",
  "token",
  "x-emby-token",
  "apitoken",
  "accesstoken",
]);

// URLSearchParams decodes names, so an encoded name (`Api%4Bey`) matches too.
export function isCredentialQueryName(name: string): boolean {
  return CREDENTIAL_QUERY_NAMES.has(name.toLowerCase());
}

// Jellyfin puts the session token into DeliveryUrl and TranscodingUrl values
// as ApiKey. Drop every credential parameter: media requests authenticate
// with the Authorization header that Rust hands to libmpv (invariant I4).
export function stripCredentialQuery(url: URL): void {
  const names = [...new Set(url.searchParams.keys())];
  for (const name of names) {
    if (isCredentialQueryName(name)) url.searchParams.delete(name);
  }
}
