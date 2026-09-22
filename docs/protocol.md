# Normalized event protocol

The mock workflow uses typed in-process TypeScript events. Live Codex traffic enters through JSONL App Server messages in the trusted Electron process and is normalized before crossing preload IPC.

Every `SpatialAgentEvent` contains `version`, monotonic `sequence`, `projectId`, `sessionId`, `provider`, UTC ISO-8601 `timestamp`, `type`, and an event-specific `payload`. Provider names are identity labels; provider SDK types never cross this boundary.

The catalog covers sessions, messages, plans, files, diffs, commands, tools, approvals, task completion and errors. `CodexLiveEvent` maps App Server notifications to `THREAD_RESUMED`, `TURN_STARTED`, `MESSAGE_DELTA`, `PLAN_UPDATED`, `ITEM_STARTED`, `ITEM_COMPLETED`, `COMMAND_OUTPUT`, `DIFF_UPDATED`, `APPROVAL_REQUESTED`, `APPROVAL_RESOLVED`, `TURN_COMPLETED` and `ERROR`. Provider request IDs remain opaque strings in the renderer and can only be returned through the constrained approval API.

The JSON Schema in `protocol/schemas/agent-event.schema.json` is the transport validation starting point. Milestone 2 must keep compile-time TypeScript definitions and runtime schema validation synchronized, reject unknown versions, cap message and output sizes, and report protocol errors clearly.

The bridge must bind to loopback by default, authenticate any non-local connection, resolve paths against registered project roots, contain symlinks, retain secrets outside the renderer, and require explicit approval for dangerous commands. Renderer intents must never become raw filesystem paths or shell commands without validation.
