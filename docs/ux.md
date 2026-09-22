# Spatial UX

The supplied reference informs the cyan and ice-blue agent core, dark translucent surfaces, violet processing state, thin geometry and amber approval state. The interface uses an actual WebGL depth field for the agent while keeping code and terminal text in high-contrast HTML surfaces.

## Layout

- Forward: selected agent and materialized activity.
- Left: project context, active file and activity history.
- Right: selectable sessions and provider identity.
- Below: command composer and a compact terminal object.
- Center only when needed: code/diff inspection and permission requests.

Pointer motion provides restrained viewing parallax in desktop simulation. Later, the same camera target can consume a fused One Pro head quaternion without changing workspace data or interactions.

## Scripted experience

| Logical time | Experience |
| --- | --- |
| 0 s | Selected session starts thinking and creates a plan |
| 3 s | READ `bridge.ts` materializes |
| 8 s | EDIT `bridge.ts`, +14 −3; diff becomes inspectable |
| 13 s | `npm test` terminal materializes |
| 17–20 s | Test output streams |
| 24 s | Install package “ws”? Allow once / Deny |
| paused | Workflow waits indefinitely for the decision |
| 29 s | 47 / 47 simulated tests pass |
| 33 s | TASK COMPLETE; activity collapses toward the agent |
| 36 s | Session completes |

No command or installation actually runs. Denial selects a simulated in-memory transport and completes the scenario.

## Interaction

- Select a project or session by clicking its spatial object.
- Select file and activity objects to inspect source, diff, or terminal output.
- Scroll code, terminal output and activity history independently.
- Use ASK, PLAN, IMPLEMENT, TEST, REVIEW and COMMIT to label a mock prompt.
- Use the top-right control or `Cmd+F` for fullscreen display.
- Use Escape to close code and terminal surfaces.

## Design constraints

Animation communicates state and then settles. The scene avoids particles, constant bloom and opaque desktop chrome. Code and decisions move closer for reading. Provider identity remains visible but secondary to the shared interaction model.
