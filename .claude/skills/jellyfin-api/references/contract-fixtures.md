# Contract fixtures

## Record

- Start the pinned server: `docker compose -f tests/integration/docker-compose.yml up -d`.
- Use a throwaway test user.
- Make the request with the real gateway or `curl` using header auth.
- Save the JSON response.

## Scrub

- Replace tokens, passwords, and `ApiKey` values with `REDACTED`.
- Replace server IDs, user IDs, and play-session IDs with stable fake values.
- Replace host names with `jellyfin.test`.
- Remove file-system paths that reveal personal data.
- Grep the file for the real token before saving.

## Store

- Save to `tests/fixtures/jellyfin/<server-version>/<endpoint>-<case>.json`.
- Record one fixture per server version that behaves differently.
- Name the case after the behavior, such as `playbackinfo-bluray-folder.json`.

## Test

- Load the fixture through a fake transport.
- Assert the outgoing method, path, body, and query.
- Assert the gateway's typed output or refusal reason.
- Add a case for every source acceptance rule.
