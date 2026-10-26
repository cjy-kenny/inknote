# Security

InkNote is a local-first desktop application. It does not operate a server, collect telemetry, or require an account.

## Data boundary

- The frontend talks to Rust through a fixed set of Tauri commands.
- File access outside the notebook directory is only performed for paths explicitly selected by the user in a system file dialog.
- The data directory can be overridden with `INKNOTE_DATA_DIR`; it should be a local directory owned by the user.
- Exported Markdown and copied `notes/` directories are plain files. Protect them with normal operating-system file permissions.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository, or contact the maintainer through the GitHub profile associated with the repository. Include:

- A description of the issue and affected version.
- Steps to reproduce.
- Whether the issue requires local access, a malicious note file, or a crafted import.

We will acknowledge reports as soon as possible and coordinate disclosure.
