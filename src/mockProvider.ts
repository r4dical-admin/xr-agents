import type { AgentEventSource, AgentEventType, AgentSession, EventPayload, ProviderId, SpatialAgentEvent, Workspace } from './models';

export const ORIGINAL_SOURCE = `import { WebSocketServer } from 'ws';

export function startBridge(port: number) {
  const server = new WebSocketServer({ port });
  server.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'CONNECTED' }));
  });
  return server;
}`;

export const UPDATED_SOURCE = `import { WebSocketServer } from 'ws';
import { validateEvent } from './events/validate';

export function startBridge(port: number) {
  const server = new WebSocketServer({ port });
  server.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'CONNECTED', version: 1 }));
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString());
      if (!validateEvent(event)) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid event' }));
        return;
      }
      routeEvent(event);
    });
  });
  return server;
}`;

export const DIFF = `@@ -1,9 +1,20 @@
 import { WebSocketServer } from 'ws';
+import { validateEvent } from './events/validate';

 export function startBridge(port: number) {
   const server = new WebSocketServer({ port });
   server.on('connection', socket => {
-    socket.send(JSON.stringify({ type: 'CONNECTED' }));
+    socket.send(JSON.stringify({ type: 'CONNECTED', version: 1 }));
+    socket.on('message', raw => {
+      const event = JSON.parse(raw.toString());
+      if (!validateEvent(event)) {
+        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid event' }));
+        return;
+      }
+      routeEvent(event);
+    });
   });
   return server;
 }`;

const session = (id: string, provider: ProviderId, displayName: string, title: string, state: AgentSession['state']): AgentSession => ({
  id, projectId: 'spatial-agent-ide', provider, displayName, title, state,
  conversation: [], tasks: [], filesTouched: [], changes: [], terminals: [], approvals: [], history: []
});

export class MockAgentProvider implements AgentEventSource {
  workspace: Workspace = { id: 'local', projects: [{
    id: 'spatial-agent-ide', name: 'spatial-agent-ide', rootDirectory: 'mock://spatial-agent-ide',
    repository: { branch: 'feat/electron-spatial-shell', dirty: false },
    files: [{ path: 'src/bridge.ts', content: ORIGINAL_SOURCE, diff: DIFF, state: 'normal', additions: 0, deletions: 0 }],
    sessions: [
      session('codex-bridge', 'codex', 'CODEX', 'Implement bridge', 'RUNNING'),
      session('claude-review', 'claude', 'CLAUDE', 'Review architecture', 'IDLE'),
      session('cursor-xr', 'cursor', 'CURSOR', 'Build XR interaction', 'RUNNING')
    ]
  }] };
  running = false;
  waiting = false;
  pendingRequest?: string;
  elapsed = 0;
  private active?: AgentSession;
  private step = 0;
  private run = 0;
  private sequence = 0;
  private denied = false;
  private listeners = new Set<(event: SpatialAgentEvent) => void>();
  private readonly times = [0, 3, 8, 13, 17, 20, 24, 29, 33, 36];

  subscribe(listener: (event: SpatialAgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prompt(sessionId: string, text: string): void {
    if (this.running) throw new Error('Finish or cancel the current mock run first.');
    if (!text.trim()) throw new Error('Prompt is empty.');
    const found = this.workspace.projects[0].sessions.find(item => item.id === sessionId);
    if (!found) throw new Error('Unknown session.');
    this.active = found;
    Object.assign(found, { history: [], terminals: [], approvals: [], filesTouched: [], changes: [], tasks: ['Inspect bridge → edit → test → approval → complete'] });
    found.conversation.push(text);
    const file = this.workspace.projects[0].files[0];
    Object.assign(file, { state: 'normal', content: ORIGINAL_SOURCE, additions: 0, deletions: 0 });
    this.workspace.projects[0].repository.dirty = false;
    this.elapsed = 0; this.step = 0; this.denied = false; this.waiting = false; this.pendingRequest = undefined; this.running = true; this.run += 1;
    this.emit('SESSION_STARTED', { text });
    this.tick(0);
  }

  tick(seconds: number): void {
    if (!this.running || this.waiting || !this.active) return;
    this.elapsed += Math.max(0, seconds);
    while (this.step < this.times.length && this.elapsed >= this.times[this.step] && !this.waiting && this.running) {
      const current = this.step++;
      if (current === 0) { this.active.state = 'THINKING'; this.emit('THINKING', { text: 'Planning the bridge implementation' }); this.emit('PLAN_CREATED', { text: this.active.tasks[0] }); }
      if (current === 1) { this.active.state = 'READING'; this.file().state = 'being-read'; this.active.filesTouched.push('src/bridge.ts'); this.emit('FILE_READ', { path: 'src/bridge.ts', text: 'Inspecting the event boundary' }); }
      if (current === 2) { this.active.state = 'EDITING'; Object.assign(this.file(), { state: 'modified', content: UPDATED_SOURCE, additions: 14, deletions: 3 }); this.workspace.projects[0].repository.dirty = true; this.active.changes.push(DIFF); this.emit('FILE_EDITED', { path: 'src/bridge.ts', additions: 14, deletions: 3 }); this.emit('DIFF_AVAILABLE', { path: 'src/bridge.ts', diff: DIFF }); }
      if (current === 3) { this.active.state = 'RUNNING'; this.active.terminals.push({ id: 'test', command: 'npm test', output: '', state: 'running' }); this.emit('COMMAND_STARTED', { terminalId: 'test', command: 'npm test' }); this.emit('TEST_STARTED', { total: 47 }); }
      if (current === 4) this.output('> spatial-agent-ide · npm test\n✓ protocol validation');
      if (current === 5) this.output('\n✓ adapter contract\n✓ workspace projection');
      if (current === 6) {
        this.active.state = 'WAITING_FOR_APPROVAL'; this.waiting = true; this.pendingRequest = `mock-install-ws-${this.run}`;
        this.active.approvals.push({ id: this.pendingRequest, description: 'Install package “ws”?', resolved: false });
        this.emit('APPROVAL_REQUESTED', { requestId: this.pendingRequest, command: 'npm install ws', text: 'Install package “ws”?' });
      }
      if (current === 7) { this.active.state = 'RUNNING'; this.output(this.denied ? '\n○ using in-memory mock transport' : '\n✓ ws transport ready'); this.emit('TEST_RESULT', { passed: 47, total: 47, text: '47 tests passed' }); }
      if (current === 8) { this.active.state = 'SUCCESS'; const terminal = this.active.terminals[0]; terminal.state = 'completed'; terminal.exitCode = 0; this.emit('COMMAND_COMPLETED', { terminalId: 'test', exitCode: 0 }); this.emit('TASK_COMPLETED', { text: 'TASK COMPLETE' }); }
      if (current === 9) { this.emit('SESSION_COMPLETED', { text: 'Implementation complete' }); this.running = false; }
    }
  }

  resolveApproval(requestId: string, allow: boolean): void {
    if (!this.active || !this.waiting || requestId !== this.pendingRequest) throw new Error('Approval request is no longer active.');
    const approval = this.active.approvals.find(item => item.id === requestId)!;
    approval.resolved = true; approval.allowed = allow; this.denied = !allow; this.waiting = false;
    this.emit('APPROVAL_RESOLVED', { requestId, allowed: allow, text: allow ? 'Allowed once' : 'Denied · continuing with mock transport' });
    this.active.state = 'RUNNING'; this.pendingRequest = undefined; this.tick(0);
  }

  cancel(sessionId: string): void {
    if (!this.running || this.active?.id !== sessionId) return;
    const terminal = this.active.terminals[0];
    if (terminal) { terminal.state = 'cancelled'; terminal.exitCode = 130; }
    if (this.waiting && this.pendingRequest) this.emit('APPROVAL_RESOLVED', { requestId: this.pendingRequest, allowed: false, text: 'Cancelled' });
    this.active.state = 'IDLE'; this.waiting = false; this.running = false; this.pendingRequest = undefined;
    this.emit('ERROR', { text: 'Mock workflow cancelled' });
  }

  private file() { return this.workspace.projects[0].files[0]; }
  private output(output: string): void { const terminal = this.active!.terminals[0]; terminal.output += output; this.emit('COMMAND_OUTPUT', { terminalId: terminal.id, output }); }
  private emit(type: AgentEventType, payload: EventPayload): void {
    const event: SpatialAgentEvent = { version: 1, sequence: ++this.sequence, projectId: this.active!.projectId, sessionId: this.active!.id, provider: this.active!.provider, timestamp: new Date().toISOString(), type, payload };
    this.active!.history.push(event); this.listeners.forEach(listener => listener(event));
  }
}
