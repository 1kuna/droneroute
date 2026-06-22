# DroneRoute Handoff

Date: 2026-06-22
Continuity: repo-state handoff. No owner thread was recovered for this pass.

## Current State

- Branch: `feat/desktop-app-packaging`
- Remote/upstream: `origin/feat/desktop-app-packaging` at `https://github.com/1kuna/droneroute.git`
- Starting state for this handoff pass: clean and aligned with upstream.
- Latest code commit before this handoff: `146e30c fix: bundle macOS Node sidecar libraries`.
- Product shape from README: DJI mission planner with web app, self-hosting, and Tauri desktop packaging.

## Last Meaningful Work

Recent commits show the active branch is specifically about desktop packaging:

- add Tauri desktop app packaging
- prevent map search from adding waypoints
- compact large survey rendering
- bundle macOS Node sidecar libraries

## What Is Not Verified In This Pass

No `npm` build, web app launch, Tauri build, or KMZ export/import smoke was run while writing this handoff.

## Resume Steps

1. Run `npm install` if dependencies are stale.
2. Run `npm run build -w packages/shared`.
3. Smoke the web app with `npm run dev`.
4. For this branch, run `npm run desktop:build` and verify the bundled Node sidecar launches inside the macOS app.
5. Smoke a tiny KMZ export before changing mission serialization.

## Cautions

- Keep desktop packaging work scoped to `feat/desktop-app-packaging`.
- Generated `node_modules`, build outputs, and local mission data should not be committed.
- This handoff is repo-state-only and should be superseded if historical project context is later recovered.
