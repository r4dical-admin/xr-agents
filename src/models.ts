export type ProviderId = 'codex' | 'claude' | 'cursor';
export type AgentState = 'IDLE' | 'LISTENING' | 'THINKING' | 'READING' | 'EDITING' | 'RUNNING' | 'WAITING_FOR_APPROVAL' | 'SUCCESS' | 'ERROR';
export type FileState = 'normal' | 'being-read' | 'being-edited' | 'modified' | 'new' | 'deleted' | 'conflict';

export const eventTypes = [
  'SESSION_STARTED', 'SESSION_RESUMED', 'THINKING', 'MESSAGE', 'PLAN_CREATED', 'PLAN_UPDATED',
  'FILE_READ', 'FILE_CREATED', 'FILE_EDITED', 'FILE_DELETED', 'DIFF_AVAILABLE', 'COMMAND_STARTED',
  'COMMAND_OUTPUT', 'COMMAND_COMPLETED', 'TEST_STARTED', 'TEST_RESULT', 'TOOL_STARTED', 'TOOL_COMPLETED',
  'SUBAGENT_STARTED', 'SUBAGENT_COMPLETED', 'APPROVAL_REQUESTED', 'APPROVAL_RESOLVED', 'GIT_CHANGED',
  'TASK_COMPLETED', 'ERROR', 'SESSION_COMPLETED'
] as const;
export type AgentEventType = typeof eventTypes[number];

export interface EventPayload {
  text?: string; path?: string; command?: string; output?: string; requestId?: string;
  terminalId?: string; diff?: string; additions?: number; deletions?: number;
  passed?: number; total?: number; exitCode?: number; allowed?: boolean;
}
export interface SpatialAgentEvent {
  version: 1; sequence: number; projectId: string; sessionId: string; provider: ProviderId;
  timestamp: string; type: AgentEventType; payload: EventPayload;
}
export interface FileRecord { path: string; content: string; diff: string; state: FileState; additions: number; deletions: number }
export interface TerminalRecord { id: string; command: string; output: string; state: 'running' | 'completed' | 'cancelled'; exitCode?: number }
export interface ApprovalRecord { id: string; description: string; resolved: boolean; allowed?: boolean }
export interface AgentSession {
  id: string; projectId: string; provider: ProviderId; displayName: string; title: string; state: AgentState;
  conversation: string[]; tasks: string[]; filesTouched: string[]; changes: string[];
  terminals: TerminalRecord[]; approvals: ApprovalRecord[]; history: SpatialAgentEvent[];
}
export interface Project {
  id: string; name: string; rootDirectory: string; repository: { branch: string; dirty: boolean };
  files: FileRecord[]; sessions: AgentSession[];
}
export interface Workspace { id: string; projects: Project[] }

export interface AgentEventSource {
  workspace: Workspace;
  running: boolean;
  waiting: boolean;
  pendingRequest?: string;
  subscribe(listener: (event: SpatialAgentEvent) => void): () => void;
  prompt(sessionId: string, text: string): void;
  resolveApproval(requestId: string, allow: boolean): void;
  cancel(sessionId: string): void;
  tick(seconds: number): void;
}
