import type { SpatialAgentEvent } from '../../../src/models';

export interface ProviderProject { id: string; name: string; rootDirectory: string }
export interface ProviderSession { id: string; projectId: string; title: string }

export interface AgentProvider {
  readonly id: string;
  readonly displayName: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listProjects?(): Promise<ProviderProject[]>;
  listSessions(project: ProviderProject): Promise<ProviderSession[]>;
  createSession(project: ProviderProject): Promise<ProviderSession>;
  resumeSession(id: string): Promise<ProviderSession>;
  prompt(sessionId: string, text: string): Promise<void>;
  approve(requestId: string): Promise<void>;
  reject(requestId: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  events(sessionId: string): AsyncIterable<SpatialAgentEvent>;
}
