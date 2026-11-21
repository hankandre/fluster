# T2-08 decisions

## What does "creates the test user on each server" mean on Jellyscale?

Decided 2026-11-21 by the coordinator; the owner may veto it.

Jellyscale has no route a script can use to create a user. It makes its one user from `adminUser` in the config and `JELLYSCALE_ADMIN_PASSWORD` in the environment, once, at the first start of a database. So `pnpm fixture:up` generates the password into a gitignored file before it starts the server, the server creates `octave-test` at its first start, and `pnpm fixture:setup` only signs in as that user and records it in `.credentials`. On the two Jellyfin servers, setup creates the user as it does today.

## Where does the Jellyscale image come from?

Decided 2026-11-21 by the coordinator; the owner may veto it.

The published GHCR package cannot be pulled anonymously (401), and its `-fixtures` image does not hold Octave's samples. The fixture builds from the public source at a pinned commit instead (D1 in `docs/specs/T2-08.md`). Making the package public is the owner's option at any time; backlog line 1 then switches the pin to a digest.
