# Octave

Octave is a Jellyfin and Jellyscale client for the TV that plays the original file whenever the device can and shows every server conversion. It is being built for Android TV first, with Apple TV kept possible, then phones and tablets, then the desktop.

It asks the server for the untouched original file and decodes it on the device: Media3 on Android, with libmpv to follow for original files Media3 cannot decode. When no engine on the device can play the original, the server repackages or converts it, and the player says which and why ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)). Every request carries the token in the `Authorization` header; a token never appears in a URL.

## Status

This is a clean slate. `main` holds the shared TypeScript core (domain rules, the Jellyfin gateway and playback negotiation, the playback coordinator, the playstate reporter, and redaction), its tests, the recorded Jellyfin fixtures, the shared validator vectors, and the server tripwire. The TV app does not exist yet: the work is planned task by task in `tasks/prd.json`, starting with phase T2 (core extraction) and T3 (the app scaffold). The stack is set by decisions [0003](docs/decisions/0003-tv-and-mobile-shell.md) and [0004](docs/decisions/0004-tv-shell-go-no-go.md): React Native with Expo SDK 58 and react-native-tvos 0.88.x, native Kotlin for networking and playback.

An earlier desktop app is kept, unmaintained, at the tag `desktop-tauri-final`, together with its task list.

## Develop

Requirements: Node 26 (pinned in `.node-version`, read by mise) and pnpm 11.

```sh
pnpm install
pnpm check
```

`pnpm check` runs the import-boundary lint, ESLint, the ghost-term check, the core's tests in Node, the type-check, and the task workflow's tests.

The server tripwire plays generated samples through the gateway against pinned Jellyfin 10.11, Jellyfin 12.4 and Jellyscale servers in Docker, once with full device capabilities and once for each of three capability sets that lack a video codec:

```sh
pnpm samples:generate
pnpm fixture:up
pnpm fixture:setup
pnpm test:tripwire
pnpm fixture:down
```

## Read next

- [PRODUCT.md](PRODUCT.md): what Octave is and for whom
- [ARCHITECTURE.md](ARCHITECTURE.md): the stack, the engines, the Jellyfin API usage, and the invariants
- [DOMAINS.md](DOMAINS.md): where code goes
- [DESIGN.md](DESIGN.md): the TV design system
- [docs/security.md](docs/security.md): the token and network boundary
- [AGENTS.md](AGENTS.md) and [WORKFLOW.md](WORKFLOW.md): how the work is done

## Licence

Octave is free software under the [GNU General Public License, version 3](LICENSE).
