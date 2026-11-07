#!/usr/bin/env bash
# Feeds fixed canary lines through the dogfood redaction filter and fails if
# the canary survives. Every canary line contains CANARY-SECRET-123 in one of
# the forms the filter must hide.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Sourcing dogfood.sh does not run its main function.
source "$script_dir/dogfood.sh"

canary="CANARY-SECRET-123"
canary_lines=(
  "api_key=$canary"
  "apikey: $canary"
  "api-key=\"$canary\""
  "access_token=$canary&format=json"
  "token: $canary"
  "X-Emby-Token: $canary"
  "X-MediaBrowser-Token=$canary"
  "password=\"$canary\""
  "pw: $canary"
  "PlaySessionId=$canary"
  "Authorization: MediaBrowser Token=\"$canary\", Client=\"fluster\""
  "Bearer $canary"
  "GET https://user:$canary@jellyfin.example.test/Items"
  "{\"token\": \"$canary\"}"
)

input_count="${#canary_lines[@]}"
output="$(printf '%s\n' "${canary_lines[@]}" | redact_stream)"
output_count="$(printf '%s\n' "$output" | grep -c . || true)"

if [[ "$output_count" != "$input_count" ]]; then
  echo "FAIL: expected $input_count redacted lines, got $output_count" >&2
  exit 1
fi

if grep -q "$canary" <<<"$output"; then
  echo "FAIL: canary leaked through redact_stream" >&2
  exit 1
fi

echo "dogfood redaction check passed ($input_count canary lines)"
