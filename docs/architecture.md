# Spatial Agent IDE architecture

## Current scope

The active proof of concept is an Electron desktop simulation using Three.js with a live Codex App Server adapter. The trusted Electron main process launches the bundled Codex transport, while the sandboxed renderer receives normalized task, item, delta and approval messages. The original Unity work is preserved under `archive/unity-milestone-1/` and is not part of the active build.

## Runtime boundary

```text
XREAL One Pro display
        │
Electron renderer · Three.js visualization and interaction
        │ normalized messages over an isolated preload/WebSocket boundary
        ▼
Spatial Agent Bridge · TypeScript / macOS
        ├── trusted project roots, files, Git and worktrees
        ├── PTY terminal processes
        ├── optional One Pro IMU helper
        └── independent Codex, Claude and Cursor adapters
```

Electron's renderer has `nodeIntegration: false`, `contextIsolation: true`, and Chromium sandboxing enabled. It does not receive provider credentials or unrestricted filesystem APIs. The preload exposes narrowly typed Codex intents, fullscreen, validated tracking controls and normalized pose notifications.

## Active components

- `src/models.ts` defines the normalized workspace hierarchy and event envelope.
- `src/mockProvider.ts` produces the deterministic workflow. Logical time stops during approval.
- `src/main.ts` projects normalized state into the spatial scene and handles user intents.
- `src/styles.css` provides readable glass surfaces while Three.js renders depth, the agent orb, rings, grid and atmospheric field.
- `electron/main.ts` owns the native window lifecycle.
- `electron/preload.ts` is the renderer/native security boundary.
- `electron/codex.ts` owns the JSONL App Server transport, validates task/project identity, resumes or creates threads, starts/steers/interrupts turns and resolves approvals.
- `electron/codexModel.ts` translates Codex thread items and server notifications into the renderer's normalized live model.
- `bridge/src/providers/AgentProvider.ts` preserves the requested provider abstraction for later real adapters.

## XREAL tracking path

The experimental macOS 3DoF path runs in the trusted Electron process reading the One Pro's USB-Ethernet IMU stream, performing sensor fusion, and publishing a timestamped quaternion. The renderer will consume a normalized `HeadPose`; it will not parse device packets. Mouse parallax remains the fallback provider.

This path provides rotation only. Official Eye-based 6DoF is not implemented and is not assumed to be exposed to macOS.

## Security rules

- Register explicit trusted project roots in the bridge.
- Resolve and verify every requested path remains inside a registered root.
- Validate every WebSocket message against the protocol schema.
- Bind locally by default and authenticate any non-local transport.
- Keep provider credentials and environment variables out of renderer messages.
- Route App Server command and file approval requests to an explicit user decision in the renderer.
- Normalize provider events before broadcasting them to the renderer.

## Performance model

The WebGL scene has a fixed number of meshes and no particle system, dynamic shadows or per-frame object allocation. Activity objects are bounded by the mock timeline. Device pixel ratio is capped at two. Future IMU input should be fused in the native helper and sampled by the renderer at display cadence rather than sending the raw ~1 kHz stream into JavaScript.
