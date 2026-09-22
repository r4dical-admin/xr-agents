import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import readline from 'node:readline';
import { normalizeTask, normalizeContent, normalizeServerEvent, type CodexApprovalDecision, type CodexLiveEvent, type CodexPage, type CodexTaskContent } from './codexModel';

export type CodexConnection = {
  connected: true;
  mode: 'desktop-service' | 'local-server';
  threads: import('./codexModel').CodexTask[];
  nextCursor: string | null;
};

type PendingRequest = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout };
type ApprovalRequest = { id: string | number; method: string; threadId: string };

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private taskIds = new Set<string>();
  private projectRoots = new Set<string>();
  private resumed = new Set<string>();
  private activeTurns = new Map<string, string>();
  private approvals = new Map<string, ApprovalRequest>();
  private connecting?: Promise<CodexConnection>;

  constructor(private readonly onStatus: (status: string) => void, private readonly onEvent: (event: CodexLiveEvent) => void = () => {}) {}

  connect(): Promise<CodexConnection> {
    if (!this.connecting) this.connecting = this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private async open(): Promise<CodexConnection> {
    this.stop();
    this.onStatus('connecting');
    try {
      return await this.start(['app-server', 'proxy'], 'desktop-service');
    } catch {
      this.stop();
      this.onStatus('starting-local-server');
      try { return await this.start(['app-server'], 'local-server'); }
      catch (error) { this.stop(); throw error; }
    }
  }

  stop(): void {
    const error = new Error('Codex connection closed.');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.child?.kill();
    this.child = null;
    this.taskIds.clear();
    this.projectRoots.clear();
    this.resumed.clear();
    this.activeTurns.clear();
    this.approvals.clear();
    this.onStatus('disconnected');
  }

  private async start(args: string[], mode: CodexConnection['mode']): Promise<CodexConnection> {
    const installed = ['/Applications/Codex.app/Contents/Resources/codex', '/Applications/ChatGPT.app/Contents/Resources/codex'];
    const executable = process.env.CODEX_CLI_PATH || installed.find(existsSync) || 'codex';
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => { if (this.child === child) this.receive(line); });
    child.stderr.resume();
    child.on('error', error => { if (this.child === child) this.fail(error); });
    child.stdin.on('error', error => { if (this.child === child) this.fail(error); });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.fail(new Error(`Codex App Server exited (${signal || code || 'unknown'}).`));
      this.onStatus('disconnected');
    });

    await this.request('initialize', {
      clientInfo: { name: 'spatial_agent_ide', title: 'Spatial Agent IDE', version: '0.5.0' }
    });
    this.notify('initialized', {});
    const page = await this.listTasks();
    this.onStatus('connected');
    return { connected: true, mode, threads: page.tasks, nextCursor: page.nextCursor };
  }

  async listTasks(cursor?: unknown): Promise<CodexPage> {
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 8192)) throw new Error('Invalid task cursor');
    const result = await this.request('thread/list', { limit: 50, sortKey: 'updated_at', sortDirection: 'desc', sourceKinds: ['cli', 'vscode', 'appServer', 'exec', 'unknown'], ...(cursor ? { cursor } : {}) }) as { data: unknown[]; nextCursor?: string };
    if (!Array.isArray(result?.data)) throw new Error('Invalid task list returned by Codex');
    const tasks = result.data.map(normalizeTask);
    tasks.forEach(task => { this.taskIds.add(task.id); if (task.cwd) this.projectRoots.add(task.cwd); });
    return { tasks, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null };
  }
  async readTask(id: unknown): Promise<CodexTaskContent> {
    this.assertTask(id);
    const result = await this.request('thread/read', { threadId: id, includeTurns: true }) as { thread: unknown };
    return normalizeContent(result.thread);
  }

  async resumeTask(id: unknown): Promise<CodexTaskContent> {
    this.assertTask(id);
    const result = await this.request('thread/resume', { threadId: id }) as { thread: unknown };
    this.resumed.add(id);
    return normalizeContent(result.thread);
  }

  async createTask(cwd: unknown, ephemeral = false): Promise<CodexTaskContent> {
    if (typeof cwd !== 'string' || !this.projectRoots.has(cwd)) throw new Error('Select a project returned by this Codex connection.');
    const result = await this.request('thread/start', { cwd, serviceName: 'spatial_agent_ide', ephemeral }) as { thread: unknown };
    const content = normalizeContent(result.thread);
    this.taskIds.add(content.task.id);
    this.resumed.add(content.task.id);
    return content;
  }

  async prompt(id: unknown, text: unknown): Promise<{ turnId: string; mode: 'start' | 'steer' }> {
    this.assertTask(id);
    if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Prompt must contain between 1 and 100,000 characters.');
    if (!this.resumed.has(id)) await this.resumeTask(id);
    const active = this.activeTurns.get(id);
    if (active) {
      const result = await this.request('turn/steer', { threadId: id, expectedTurnId: active, input: [{ type: 'text', text: text.trim() }] }) as { turnId?: string };
      return { turnId: typeof result.turnId === 'string' ? result.turnId : active, mode: 'steer' };
    }
    const result = await this.request('turn/start', { threadId: id, input: [{ type: 'text', text: text.trim() }] }) as { turn?: { id?: string } };
    const turnId = typeof result?.turn?.id === 'string' ? result.turn.id : '';
    if (!turnId) throw new Error('Codex did not return a turn id.');
    this.activeTurns.set(id, turnId);
    return { turnId, mode: 'start' };
  }

  async interrupt(id: unknown): Promise<void> {
    this.assertTask(id);
    const turnId = this.activeTurns.get(id);
    if (!turnId) return;
    await this.request('turn/interrupt', { threadId: id, turnId });
  }

  resolveApproval(requestId: unknown, decision: unknown): void {
    if (typeof requestId !== 'string') throw new Error('Invalid approval request.');
    if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(String(decision))) throw new Error('Invalid approval decision.');
    const approval = this.approvals.get(requestId);
    if (!approval) throw new Error('This approval request is no longer pending.');
    this.write({ id: approval.id, result: { decision: decision as CodexApprovalDecision } });
    this.approvals.delete(requestId);
    this.onEvent({ type: 'APPROVAL_RESOLVED', threadId: approval.threadId, itemId: requestId, status: String(decision) });
  }

  private assertTask(id: unknown): asserts id is string {
    if (typeof id !== 'string' || !this.taskIds.has(id)) throw new Error('Select a task returned by this Codex connection');
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error('Codex App Server is unavailable.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) throw new Error('Codex App Server is unavailable.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: Record<string, unknown>;
    try { message = JSON.parse(line) as Record<string, unknown>; } catch { return; }
    if (typeof message.method === 'string') {
      const requestId = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : undefined;
      const params = message.params;
      if (requestId !== undefined && (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval')) {
        const normalized = normalizeServerEvent(message.method, params, requestId);
        if (normalized?.approval) {
          this.approvals.set(String(requestId), { id: requestId, method: message.method, threadId: normalized.threadId });
          this.onEvent(normalized);
        }
        return;
      }
      if (requestId !== undefined) {
        this.write({ id: requestId, error: { code: -32601, message: `Unsupported server request: ${message.method}` } });
        return;
      }
      const event = normalizeServerEvent(message.method, params);
      if (!event) return;
      if (event.type === 'THREAD_RESUMED') this.resumed.add(event.threadId);
      if (event.type === 'TURN_STARTED' && event.turnId) this.activeTurns.set(event.threadId, event.turnId);
      if (event.type === 'TURN_COMPLETED') this.activeTurns.delete(event.threadId);
      if (event.type === 'APPROVAL_RESOLVED' && event.itemId) this.approvals.delete(event.itemId);
      this.onEvent(event);
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(this.errorMessage(message.error)));
    else pending.resolve(message.result);
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private errorMessage(value: unknown): string {
    if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') return value.message;
    return 'Codex App Server returned an error.';
  }
}
