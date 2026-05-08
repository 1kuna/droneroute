## Summary

Added a Tauri desktop packaging path so DroneRoute can run as a one-click local
app without Docker or manual server startup.

## Changes

- Added a new `@droneroute/desktop` workspace with Tauri 2 configuration
- Bundled a platform-local Node sidecar for running the existing backend
- Added a desktop preparation script that installs a private production backend runtime
- Bundled Homebrew-style macOS Node dynamic libraries when the sidecar Node binary
  depends on them
- Let the frontend resolve its API base URL from Tauri when running in the desktop shell
- Documented desktop build outputs and behavior in README and specs
