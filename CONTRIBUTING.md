# Contributing

Thanks for taking the time to improve InkNote.

## Before you start

InkNote is intentionally small and local-first. Changes that add accounts, cloud sync, collaboration, telemetry, a plugin marketplace, or a built-in AI assistant are out of scope for the first version.

Good areas for contributions:

- Markdown editing and accessibility fixes.
- Chinese/English search quality in the SQLite FTS5 layer.
- Cross-platform path, shortcut and window behaviour.
- Reliability: atomic save, drafts, snapshots, reconcile, conflict handling.
- Performance with large notebooks.

## Development

```bash
pnpm install
pnpm dev          # browser demo (localStorage)
pnpm tauri dev    # desktop app
pnpm test
pnpm build
```

Rust checks:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

The Tauri build needs the platform prerequisites listed in the README (MSVC + WebView2 on Windows, Xcode on macOS, WebKitGTK on Linux).

## Pull requests

- Keep changes focused; explain the user-facing reason.
- Add a test when behaviour changes.
- Do not commit generated `dist/`, `node_modules/`, `src-tauri/target/`, local data, or binaries.
- Match the existing visual language: restrained, paper-like, no heavy UI dependencies.

## Reporting bugs

Please include:

1. OS and InkNote version.
2. Steps to reproduce.
3. Whether the notebook uses a custom `INKNOTE_DATA_DIR`.
4. Console output / screenshots if relevant, with private note content removed.
