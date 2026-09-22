# Spatial Agent Bridge

Milestone 1 defines the provider-neutral TypeScript interface in `src/providers/AgentProvider.ts`; it does not connect to live providers, files, Git or terminals.

Milestone 2 will run this bridge in Electron's trusted process or an isolated local helper and expose only normalized events and typed intents to the sandboxed renderer. Provider implementations will remain independent and provider-specific types will be normalized before transport.
