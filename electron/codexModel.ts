export interface CodexTask { id: string; title: string; preview: string; cwd: string; branch: string; status: string; source: string; model: string }
export interface CodexItem { id: string; kind: 'user' | 'assistant' | 'plan' | 'command' | 'file' | 'tool'; text: string; detail?: string; status?: string }
export interface CodexPage { tasks: CodexTask[]; nextCursor: string | null }
export interface CodexTaskContent { task: CodexTask; items: CodexItem[] }
export interface CodexConnection { connected: true; mode: 'desktop-service' | 'local-server'; threads: CodexTask[]; nextCursor: string | null }
export type CodexApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
export interface CodexApproval {
  requestId: string;
  kind: 'command' | 'file';
  title: string;
  command: string;
  reason: string;
  allowSession: boolean;
}
export type CodexLiveEventType = 'THREAD_RESUMED' | 'TURN_STARTED' | 'MESSAGE_DELTA' | 'PLAN_UPDATED' | 'ITEM_STARTED' | 'ITEM_COMPLETED' | 'COMMAND_OUTPUT' | 'DIFF_UPDATED' | 'APPROVAL_REQUESTED' | 'APPROVAL_RESOLVED' | 'TOKEN_USAGE' | 'TURN_COMPLETED' | 'ERROR';
export interface CodexLiveEvent {
  type: CodexLiveEventType;
  threadId: string;
  turnId?: string;
  itemId?: string;
  item?: CodexItem;
  items?: CodexItem[];
  delta?: string;
  diff?: string;
  status?: string;
  message?: string;
  approval?: CodexApproval;
  usage?: { used: number; last: number; context: number | null; remaining: number | null };
}
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function normalizeTask(value: unknown): CodexTask {
  const t = obj(value);
  if (!str(t.id)) throw new Error('Invalid task returned by Codex');
  return { id: str(t.id), title: str(t.name) || str(t.preview).split('\n')[0].slice(0, 100) || 'Untitled task', preview: str(t.preview), cwd: str(t.cwd), branch: str(obj(t.gitInfo).branch), status: str(obj(t.status).type) || 'unknown', source: str(t.source) || 'subAgent', model: str(t.model) };
}
export function normalizeContent(value: unknown): CodexTaskContent {
  const t = obj(value), items: CodexItem[] = [];
  for (const turn of arr(t.turns)) for (const raw of arr(obj(turn).items)) items.push(...normalizeItem(raw));
  return { task: normalizeTask(t), items };
}

export function normalizeItem(value: unknown): CodexItem[] {
  const i = obj(value), id = str(i.id), status = str(i.status);
  if (!id) return [];
  if (i.type === 'userMessage') return [{ id, kind: 'user', text: arr(i.content).map(c => str(obj(c).text) || `[${str(obj(c).type) || 'attachment'}]`).join('\n') }];
  if (i.type === 'agentMessage' || i.type === 'plan') return [{ id, kind: i.type === 'plan' ? 'plan' : 'assistant', text: str(i.text), status }];
  if (i.type === 'commandExecution') return [{ id, kind: 'command', text: str(i.command), detail: str(i.aggregatedOutput), status: `${status}${typeof i.exitCode === 'number' ? ` · exit ${i.exitCode}` : ''}` }];
  if (i.type === 'fileChange') return arr(i.changes).map(change => { const c = obj(change); return { id: `${id}:${str(c.path)}`, kind: 'file' as const, text: str(c.path), detail: str(c.diff), status: str(c.kind) || status }; });
  if (i.type === 'mcpToolCall' || i.type === 'dynamicToolCall' || i.type === 'collabAgentToolCall') return [{ id, kind: 'tool', text: [str(i.server), str(i.tool)].filter(Boolean).join(' / ') || str(i.type), detail: i.arguments ? JSON.stringify(i.arguments, null, 2) : '', status }];
  return [];
}

export function normalizeServerEvent(method: string, value: unknown, requestId?: string | number): CodexLiveEvent | null {
  const p = obj(value), threadId = str(p.threadId), turnId = str(p.turnId);
  if (method === 'thread/started') return { type: 'THREAD_RESUMED', threadId: str(obj(p.thread).id) || threadId };
  if (method === 'turn/started') return { type: 'TURN_STARTED', threadId, turnId: str(obj(p.turn).id), status: str(obj(p.turn).status) };
  if (method === 'item/agentMessage/delta') return { type: 'MESSAGE_DELTA', threadId, turnId, itemId: str(p.itemId), delta: str(p.delta) };
  if (method === 'item/commandExecution/outputDelta') return { type: 'COMMAND_OUTPUT', threadId, turnId, itemId: str(p.itemId), delta: str(p.delta) };
  if (method === 'turn/diff/updated') return { type: 'DIFF_UPDATED', threadId, turnId, diff: str(p.diff) };
  if (method === 'turn/plan/updated') {
    const plan = arr(p.plan).map(step => `${str(obj(step).status) === 'completed' ? '✓' : str(obj(step).status) === 'inProgress' ? '●' : '○'} ${str(obj(step).step)}`).join('\n');
    return { type: 'PLAN_UPDATED', threadId, turnId, itemId: `${turnId}:plan`, delta: [str(p.explanation), plan].filter(Boolean).join('\n\n') };
  }
  if (method === 'item/started' || method === 'item/completed') {
    const items = normalizeItem(p.item), item = items[0];
    return item ? { type: method === 'item/started' ? 'ITEM_STARTED' : 'ITEM_COMPLETED', threadId, turnId, itemId: item.id, item, items } : null;
  }
  if (method === 'turn/completed') {
    const turn = obj(p.turn), error = obj(turn.error);
    return { type: 'TURN_COMPLETED', threadId, turnId: str(turn.id), status: str(turn.status), message: str(error.message) };
  }
  if (method === 'thread/tokenUsage/updated') {
    const usage = obj(p.tokenUsage), total = obj(usage.total), last = obj(usage.last);
    const used = typeof total.totalTokens === 'number' ? total.totalTokens : 0;
    const context = typeof usage.modelContextWindow === 'number' ? usage.modelContextWindow : null;
    return { type: 'TOKEN_USAGE', threadId, turnId, usage: { used, last: typeof last.totalTokens === 'number' ? last.totalTokens : 0, context, remaining: context === null ? null : Math.max(0, context - used) } };
  }
  if (method === 'error') return { type: 'ERROR', threadId, turnId, message: str(obj(p.error).message) || 'Codex turn failed.' };
  if (method === 'serverRequest/resolved') return { type: 'APPROVAL_RESOLVED', threadId, itemId: String(p.requestId ?? '') };
  if ((method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') && requestId !== undefined) {
    const command = str(p.command) || str(p.grantRoot) || 'Review requested change';
    const decisions = arr(p.availableDecisions);
    return { type: 'APPROVAL_REQUESTED', threadId, turnId, itemId: str(p.itemId), approval: {
      requestId: String(requestId), kind: method.includes('commandExecution') ? 'command' : 'file',
      title: method.includes('commandExecution') ? 'Allow command?' : 'Allow file changes?', command,
      reason: str(p.reason) || (method.includes('commandExecution') ? 'Codex needs permission to run this command.' : 'Codex needs permission to apply these changes.'),
      allowSession: !decisions.length || decisions.includes('acceptForSession')
    } };
  }
  return null;
}
