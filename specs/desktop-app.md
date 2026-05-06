# Desktop app

Run DroneRoute locally as a native desktop application.

## What you can do

- Launch DroneRoute from a normal desktop app bundle.
- Plan, import, save, and export missions without starting a server manually.
- Keep route data in the operating system's application data folder.

## How it works

The desktop build uses Tauri. When the app starts, it launches a bundled Node
sidecar that runs the same DroneRoute backend used by the web app. The frontend
asks Tauri for the local backend URL and sends API requests to that hidden local
server.

## Good to know

- End users do not need Docker or command-line startup commands.
- Builds are produced per platform, so macOS, Windows, and Linux installers must
  be built on their respective target platforms or in platform-specific CI.
- The backend runs only on `127.0.0.1` and uses a random available local port.
- The SQLite database is stored under the app data directory for the installed
  desktop app.
