#!/usr/bin/env bash
# Completes the Jellyfin startup wizard on both fixture servers, creates a test
# user with a random password, and registers the Movies and Shows libraries.
# Credentials are written to tests/integration/.credentials (gitignored).
# Safe to re-run: finished servers are only checked, never reconfigured.
set -euo pipefail
# Every file this script creates holds secrets; keep them private.
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
credentials_file="$script_dir/.credentials"
user_name="fluster-test"
# A second user whose policy forbids all conversion (P10-02, decision 0002 "conversion-not-allowed").
restricted_user_name="fluster-noconv"

# Name and URL of each fixture server.
servers=(
  "jellyfin-10-11 http://127.0.0.1:18096"
  "jellyfin-12 http://127.0.0.1:18097"
)

header_file="$(mktemp)"
trap 'rm -f "$header_file" "$credentials_file.tmp"' EXIT
chmod 600 "$header_file"

log() {
  echo "[setup] $*"
}

# Reads a value saved earlier for a server, such as its password.
saved_value() {
  local name="$1" key="$2"
  [ -f "$credentials_file" ] || return 0
  grep "^${name}_${key}=" "$credentials_file" | head -n 1 | cut -d= -f2- || true
}

save_credentials() {
  local name="$1" url="$2" password="$3"
  touch "$credentials_file"
  chmod 600 "$credentials_file"
  grep -v "^${name}_" "$credentials_file" > "$credentials_file.tmp" || true
  {
    echo "${name}_url=${url}"
    echo "${name}_username=${user_name}"
    echo "${name}_password=${password}"
  } >> "$credentials_file.tmp"
  mv "$credentials_file.tmp" "$credentials_file"
  chmod 600 "$credentials_file"
}

wait_for_health() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -fsS "$url/health" > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "[setup] $url never became healthy" >&2
  return 1
}

# Unauthenticated JSON POST used by the startup wizard.
post_json() {
  local url="$1" body="$2"
  # Send the body on stdin so passwords never appear in the process list.
  printf '%s' "$body" | curl -fsS -o /dev/null -X POST -H "Content-Type: application/json" -d @- "$url"
}

run_wizard() {
  local url="$1" password="$2"
  post_json "$url/Startup/Configuration" \
    '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
  # Reading the first user makes the server create it before it is renamed.
  curl -fsS -o /dev/null "$url/Startup/User"
  post_json "$url/Startup/User" "{\"Name\":\"$user_name\",\"Password\":\"$password\"}"
  post_json "$url/Startup/Complete" '{}'
}

# Logs in and writes the Authorization header to a private file, so the token
# never appears in output or in the URL.
authenticate() {
  local url="$1" password="$2" response token
  local client='MediaBrowser Client="Fluster Tests", Device="ci", DeviceId="fluster-ci", Version="0"'
  response="$(printf '{"Username":"%s","Pw":"%s"}' "$user_name" "$password" |
    curl -fsS -X POST "$url/Users/AuthenticateByName" \
      -H "Authorization: $client" \
      -H "Content-Type: application/json" \
      -d @-)"
  token="$(echo "$response" | jq -r '.AccessToken // empty')"
  if [ -z "$token" ]; then
    echo "[setup] $url returned no access token" >&2
    return 1
  fi
  echo "Authorization: $client, Token=\"$token\"" > "$header_file"
}

ensure_library() {
  local url="$1" name="$2" collection_type="$3" path="$4" existing
  existing="$(curl -fsS -H @"$header_file" "$url/Library/VirtualFolders" | jq -r --arg n "$name" '.[] | select(.Name == $n) | .Name')"
  if [ -n "$existing" ]; then
    log "  library $name already exists"
    return 0
  fi
  curl -fsS -o /dev/null -X POST -H @"$header_file" -H "Content-Type: application/json" \
    -G --data-urlencode "name=$name" \
    --data-urlencode "collectionType=$collection_type" \
    --data-urlencode "paths=$path" \
    --data-urlencode "refreshLibrary=false" \
    -d '{"LibraryOptions":{}}' \
    "$url/Library/VirtualFolders"
  log "  library $name created"
}

# Creates the restricted user with video transcoding, audio transcoding, and remuxing
# disabled. Field names: UserPolicy in the servers' /api-docs/openapi.json (10.11.7, 12.4)
# and @jellyfin/sdk 1.0.2 user-policy.d.ts. Uses the admin header file.
ensure_restricted_user() {
  local url="$1" name="$2" existing password id policy
  existing="$(curl -fsS -H @"$header_file" "$url/Users" | jq -r --arg n "$restricted_user_name" '.[] | select(.Name == $n) | .Id')"
  if [ -n "$existing" ]; then
    log "  user $restricted_user_name already exists"
    return 0
  fi
  password="$(openssl rand -hex 16)"
  id="$(printf '{"Name":"%s","Password":"%s"}' "$restricted_user_name" "$password" |
    curl -fsS -X POST -H @"$header_file" -H "Content-Type: application/json" -d @- "$url/Users/New" | jq -r '.Id')"
  policy="$(curl -fsS -H @"$header_file" "$url/Users/$id" |
    jq -c '.Policy | .EnableVideoPlaybackTranscoding = false | .EnableAudioPlaybackTranscoding = false | .EnablePlaybackRemuxing = false')"
  printf '%s' "$policy" | curl -fsS -o /dev/null -X POST -H @"$header_file" -H "Content-Type: application/json" -d @- "$url/Users/$id/Policy"
  {
    echo "${name}_restricted_username=${restricted_user_name}"
    echo "${name}_restricted_password=${password}"
  } >> "$credentials_file"
  log "  user $restricted_user_name created (transcoding and remuxing disabled)"
}

for server in "${servers[@]}"; do
  name="${server%% *}"
  url="${server##* }"
  log "$name at $url"
  wait_for_health "$url"

  completed="$(curl -fsS "$url/System/Info/Public" | jq -r '.StartupWizardCompleted')"
  password="$(saved_value "$name" password)"

  if [ "$completed" = "false" ]; then
    password="$(openssl rand -hex 16)"
    run_wizard "$url" "$password"
    save_credentials "$name" "$url" "$password"
    log "  startup wizard completed, user $user_name created"
  elif [ -z "$password" ]; then
    echo "[setup] $name is already set up but $credentials_file has no password for it." >&2
    echo "[setup] Run pnpm fixture:down and pnpm fixture:up to start clean." >&2
    exit 1
  else
    log "  startup wizard already completed"
  fi

  authenticate "$url" "$password"
  ensure_library "$url" "Movies" "movies" "/media/movies"
  ensure_library "$url" "Shows" "tvshows" "/media/shows"
  ensure_restricted_user "$url" "$name"
done

log "done, credentials in $credentials_file"
